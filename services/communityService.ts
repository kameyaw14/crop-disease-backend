// services/communityService.ts
import { v2 as cloudinary } from "cloudinary";
import { prisma } from "../config/connectDb.js";
import {
  createPostSchema,
  getMyPostsSchema,
  getPostsSchema,
  type CreatePostInput,
  type GetPostsInput,
} from "../schema/communitySchema.js";

export const communityService = {
  async createPost(
    userId: string,
    data: any,
    files: Express.Multer.File[] = [],
  ) {
    // 1. Validate input
    const validated: CreatePostInput = createPostSchema.parse(data);

    // 2. Limit images to max 3 (extra safety)
    if (files.length > 3) {
      throw new Error("You can only upload up to 3 images");
    }

    // 3. Validate that all tagIds exist
    const existingTags = await prisma.tag.findMany({
      where: { id: { in: validated.tagIds } },
      select: { id: true },
    });

    if (existingTags.length !== validated.tagIds.length) {
      throw new Error("One or more selected tags are invalid");
    }

    // 4. Optional: Validate detectionId belongs to the current user
    if (validated.detectionId) {
      const detection = await prisma.detection.findFirst({
        where: {
          id: validated.detectionId,
          userId,
        },
        select: { id: true },
      });

      if (!detection) {
        throw new Error("This detection does not belong to you");
      }
    }

    // 5. Upload images to Cloudinary
    const imageUrls: string[] = [];

    for (const file of files) {
      const uploadResult = await new Promise<any>((resolve, reject) => {
        cloudinary.uploader
          .upload_stream(
            {
              folder: "crop-diagnose/community",
              resource_type: "image",
              transformation: [{ width: 1200, crop: "limit" }],
            },
            (error, result) => {
              if (error) reject(error);
              else resolve(result);
            },
          )
          .end(file.buffer);
      });

      imageUrls.push(uploadResult.secure_url);
    }

    // 6. Create Post + PostTags inside a transaction
    const post = await prisma.$transaction(async (tx) => {
      const newPost = await tx.post.create({
        data: {
          userId,
          content: validated.content,
          imageUrls,
          region: validated.region,
          cropType: validated.cropType,
          detectionId: validated.detectionId,
        },
      });

      // Link tags
      await tx.postTag.createMany({
        data: validated.tagIds.map((tagId) => ({
          postId: newPost.id,
          tagId,
        })),
      });

      // Return full post with relations for response
      return tx.post.findUnique({
        where: { id: newPost.id },
        include: {
          user: {
            select: {
              id: true,
              profile: {
                select: {
                  fullName: true,
                  avatarUrl: true,
                  reputationScore: true,
                },
              },
            },
          },
          tags: {
            include: {
              tag: {
                select: {
                  id: true,
                  name: true,
                  slug: true,
                },
              },
            },
          },
        },
      });
    });

    return {
      success: true,
      message: "Post created successfully",
      data: {
        id: post!.id,
        content: post!.content,
        imageUrls: post!.imageUrls,
        region: post!.region,
        cropType: post!.cropType,
        detectionId: post!.detectionId,
        likesCount: post!.likesCount,
        commentsCount: post!.commentsCount,
        savesCount: post!.savesCount,
        createdAt: post!.createdAt,
        author: {
          id: post!.user.id,
          fullName: post!.user.profile?.fullName ?? "Unknown",
          avatarUrl: post!.user.profile?.avatarUrl ?? null,
          reputationScore: post!.user.profile?.reputationScore ?? 0,
        },
        tags: post!.tags.map((pt) => ({
          id: pt.tag.id,
          name: pt.tag.name,
          slug: pt.tag.slug,
        })),
      },
    };
  },

  async getAllTags() {
    const tags = await prisma.tag.findMany({
      select: {
        id: true,
        name: true,
        slug: true,
      },
      orderBy: {
        createdAt: "asc", // preserves the order we seeded them
      },
    });

    return {
      success: true,
      message: "Tags retrieved successfully",
      data: tags,
      total: tags.length,
    };
  },

  async getPostById(postId: string, currentUserId?: string) {
    const post = await prisma.post.findUnique({
      where: { id: postId },
      include: {
        user: {
          select: {
            id: true,
            profile: {
              select: {
                fullName: true,
                avatarUrl: true,
                reputationScore: true,
              },
            },
          },
        },
        tags: {
          include: {
            tag: {
              select: {
                id: true,
                name: true,
                slug: true,
              },
            },
          },
        },
      },
    });

    if (!post) {
      return {
        success: false,
        message: "Post not found",
      };
    }

    // Check if the current user has liked / saved this post (only if logged in)
    let isLiked = false;
    let isSaved = false;

    if (currentUserId) {
      const [like, saved] = await Promise.all([
        prisma.postLike.findUnique({
          where: {
            userId_postId: {
              userId: currentUserId,
              postId,
            },
          },
        }),
        prisma.savedPost.findUnique({
          where: {
            userId_postId: {
              userId: currentUserId,
              postId,
            },
          },
        }),
      ]);

      isLiked = !!like;
      isSaved = !!saved;
    }

    return {
      success: true,
      message: "Post retrieved successfully",
      data: {
        id: post.id,
        content: post.content,
        imageUrls: post.imageUrls,
        region: post.region,
        cropType: post.cropType,
        detectionId: post.detectionId,
        likesCount: post.likesCount,
        commentsCount: post.commentsCount,
        savesCount: post.savesCount,
        createdAt: post.createdAt,
        updatedAt: post.updatedAt,
        author: {
          id: post.user.id,
          fullName: post.user.profile?.fullName ?? "Unknown",
          avatarUrl: post.user.profile?.avatarUrl ?? null,
          reputationScore: post.user.profile?.reputationScore ?? 0,
        },
        tags: post.tags.map((pt) => ({
          id: pt.tag.id,
          name: pt.tag.name,
          slug: pt.tag.slug,
        })),
        // Only included when user is logged in
        ...(currentUserId && {
          isLiked,
          isSaved,
        }),
      },
    };
  },

  async getMyPosts(userId: string, query: any) {
    const validated = getMyPostsSchema.parse(query);

    const page = validated.page || 1;
    const limit = Math.min(validated.limit || 10, 50);
    const skip = (page - 1) * limit;

    const [posts, total] = await Promise.all([
      prisma.post.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        include: {
          tags: {
            include: {
              tag: {
                select: {
                  id: true,
                  name: true,
                  slug: true,
                },
              },
            },
          },
        },
      }),
      prisma.post.count({ where: { userId } }),
    ]);

    // Get liked & saved status for these posts
    const postIds = posts.map((p) => p.id);

    const [likes, saves] = await Promise.all([
      prisma.postLike.findMany({
        where: {
          userId,
          postId: { in: postIds },
        },
        select: { postId: true },
      }),
      prisma.savedPost.findMany({
        where: {
          userId,
          postId: { in: postIds },
        },
        select: { postId: true },
      }),
    ]);

    const likedSet = new Set(likes.map((l) => l.postId));
    const savedSet = new Set(saves.map((s) => s.postId));

    const data = posts.map((post) => ({
      id: post.id,
      content: post.content,
      imageUrls: post.imageUrls,
      region: post.region,
      cropType: post.cropType,
      detectionId: post.detectionId,
      likesCount: post.likesCount,
      commentsCount: post.commentsCount,
      savesCount: post.savesCount,
      createdAt: post.createdAt,
      updatedAt: post.updatedAt,
      tags: post.tags.map((pt) => ({
        id: pt.tag.id,
        name: pt.tag.name,
        slug: pt.tag.slug,
      })),
      isLiked: likedSet.has(post.id),
      isSaved: savedSet.has(post.id),
    }));

    return {
      success: true,
      message:
        total > 0
          ? "Your posts retrieved successfully"
          : "You have not created any posts yet",
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  },

  async deletePost(userId: string, postId: string) {
    // 1. Find the post and verify ownership
    const post = await prisma.post.findUnique({
      where: { id: postId },
      select: {
        id: true,
        userId: true,
        imageUrls: true,
      },
    });

    if (!post) {
      return {
        success: false,
        message: "Post not found",
      };
    }

    if (post.userId !== userId) {
      return {
        success: false,
        message: "You can only delete your own posts",
      };
    }

    // 2. Best-effort delete images from Cloudinary
    if (post.imageUrls && post.imageUrls.length > 0) {
      for (const imageUrl of post.imageUrls) {
        try {
          // Extract public_id from Cloudinary URL
          // Example: https://res.cloudinary.com/xxx/image/upload/v123/crop-diagnose/community/abc.jpg
          const parts = imageUrl.split("/");
          const uploadIndex = parts.findIndex((p) => p === "upload");

          if (uploadIndex !== -1) {
            const publicIdWithExt = parts.slice(uploadIndex + 2).join("/");
            const publicId = publicIdWithExt.replace(/\.[^/.]+$/, ""); // remove extension
            await cloudinary.uploader.destroy(publicId);
            console.log(
              "🗑️ Deleted community image from Cloudinary:",
              publicId,
            );
          }
        } catch (deleteError: any) {
          // Never block the post deletion if Cloudinary fails
          console.warn(
            "⚠️ Failed to delete community image (non-blocking):",
            deleteError.message,
          );
        }
      }
    }

    // 3. Hard delete the post (cascades comments, likes, saves, PostTags)
    await prisma.post.delete({
      where: { id: postId },
    });

    return {
      success: true,
      message: "Post deleted successfully",
    };
  },

  async getPosts(query: any, currentUserId?: string) {
    const validated: GetPostsInput = getPostsSchema.parse(query);

    const page = validated.page || 1;
    const limit = Math.min(validated.limit || 10, 20);
    const skip = (page - 1) * limit;

    const where: any = {};

    if (validated.region) {
      where.region = validated.region;
    }

    if (validated.cropType) {
      where.cropType = validated.cropType;
    }

    if (validated.q) {
      where.content = {
        contains: validated.q,
        mode: "insensitive",
      };
    }

    if (validated.tag) {
      where.tags = {
        some: {
          tag: {
            slug: validated.tag,
          },
        },
      };
    }

    const [posts, total] = await Promise.all([
      prisma.post.findMany({
        where,
        orderBy: { createdAt: "desc" }, // chronological (newest first)
        skip,
        take: limit,
        include: {
          user: {
            select: {
              id: true,
              profile: {
                select: {
                  fullName: true,
                  avatarUrl: true,
                  reputationScore: true,
                },
              },
            },
          },
          tags: {
            include: {
              tag: {
                select: {
                  id: true,
                  name: true,
                  slug: true,
                },
              },
            },
          },
        },
      }),
      prisma.post.count({ where }),
    ]);

    let likedSet = new Set<string>();
    let savedSet = new Set<string>();

    if (currentUserId && posts.length > 0) {
      const postIds = posts.map((p) => p.id);

      const [likes, saves] = await Promise.all([
        prisma.postLike.findMany({
          where: {
            userId: currentUserId,
            postId: { in: postIds },
          },
          select: { postId: true },
        }),
        prisma.savedPost.findMany({
          where: {
            userId: currentUserId,
            postId: { in: postIds },
          },
          select: { postId: true },
        }),
      ]);

      likedSet = new Set(likes.map((l) => l.postId));
      savedSet = new Set(saves.map((s) => s.postId));
    }

    const data = posts.map((post) => ({
      id: post.id,
      content: post.content, // full content - frontend truncates if needed
      imageUrls: post.imageUrls,
      region: post.region,
      cropType: post.cropType,
      likesCount: post.likesCount,
      commentsCount: post.commentsCount,
      savesCount: post.savesCount,
      createdAt: post.createdAt,
      updatedAt: post.updatedAt,
      author: {
        id: post.user.id,
        fullName: post.user.profile?.fullName ?? "Unknown",
        avatarUrl: post.user.profile?.avatarUrl ?? null,
        reputationScore: post.user.profile?.reputationScore ?? 0,
      },
      tags: post.tags.map((pt) => ({
        id: pt.tag.id,
        name: pt.tag.name,
        slug: pt.tag.slug,
      })),
      ...(currentUserId && {
        isLiked: likedSet.has(post.id),
        isSaved: savedSet.has(post.id),
      }),
    }));

    return {
      success: true,
      message:
        total > 0
          ? "Posts retrieved successfully"
          : "No posts found. Be the first to share your experience!",
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 0,
      },
    };
  },
};
