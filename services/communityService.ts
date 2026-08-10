// services/communityService.ts
// @ts-nocheck
import { v2 as cloudinary } from "cloudinary";
import { prisma } from "../config/connectDb.js";
import {
  createCommentSchema,
  createPostSchema,
  createReplySchema,
  getCommentsSchema,
  getFollowersSchema,
  getMyPostsSchema,
  getPostLikesSchema,
  getPostsSchema,
  getSavedPostsSchema,
  type CreateCommentInput,
  type CreatePostInput,
  type CreateReplyInput,
  type GetCommentsInput,
  type GetPostLikesInput,
  type GetPostsInput,
  type GetSavedPostsInput,
} from "../schema/communitySchema.js";

type CommentMarkType = "HELPFUL" | "SOLVED";

type CommentAuthor = {
  id: string;
  fullName: string;
  avatarUrl: string | null;
  reputationScore: number;
};

function formatCommentAuthor(user: {
  id: string;
  profile: {
    fullName: string;
    avatarUrl: string | null;
    reputationScore: number;
  } | null;
}): CommentAuthor {
  return {
    id: user.id,
    fullName: user.profile?.fullName ?? "Unknown",
    avatarUrl: user.profile?.avatarUrl ?? null,
    reputationScore: user.profile?.reputationScore ?? 0,
  };
}

const commentAuthorInclude = {
  id: true,
  profile: {
    select: {
      fullName: true,
      avatarUrl: true,
      reputationScore: true,
    },
  },
} as const;

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

  async createComment(userId: string, postId: string, data: any) {
    const validated: CreateCommentInput = createCommentSchema.parse(data);

    const post = await prisma.post.findUnique({
      where: { id: postId },
      select: { id: true },
    });

    if (!post) {
      throw new Error("Post not found");
    }

    const comment = await prisma.$transaction(async (tx) => {
      const newComment = await tx.comment.create({
        data: {
          postId,
          userId,
          content: validated.content,
          // parentId is left undefined (null in the DB) since this is a
          // top-level comment, not a reply
        },
      });

      await tx.post.update({
        where: { id: postId },
        data: { commentsCount: { increment: 1 } },
      });

      return tx.comment.findUnique({
        where: { id: newComment.id },
        include: { user: { select: commentAuthorInclude } },
      });
    });

    return {
      success: true,
      message: "Comment posted successfully",
      data: {
        id: comment!.id,
        postId: comment!.postId,
        parentId: comment!.parentId,
        content: comment!.content,
        helpfulCount: comment!.helpfulCount,
        solvedCount: comment!.solvedCount,
        createdAt: comment!.createdAt,
        author: formatCommentAuthor(comment!.user),
        replies: [] as const, // a brand-new comment never has replies yet
      },
    };
  },

  async createReply(userId: string, commentId: string, data: any) {
    const validated: CreateReplyInput = createReplySchema.parse(data);

    const parentComment = await prisma.comment.findUnique({
      where: { id: commentId },
      select: { id: true, postId: true, parentId: true },
    });

    if (!parentComment) {
      throw new Error("Comment not found");
    }

    // If the comment we're replying to already HAS a parentId, it means it is
    // itself a reply. Replying to a reply would create a second level of
    // nesting, which the product docs explicitly rule out.
    if (parentComment.parentId !== null) {
      throw new Error(
        "Replies can only be added to a top-level comment, not to another reply",
      );
    }

    const reply = await prisma.$transaction(async (tx) => {
      const newReply = await tx.comment.create({
        data: {
          postId: parentComment.postId,
          userId,
          parentId: parentComment.id,
          content: validated.content,
        },
      });

      await tx.post.update({
        where: { id: parentComment.postId },
        data: { commentsCount: { increment: 1 } },
      });

      return tx.comment.findUnique({
        where: { id: newReply.id },
        include: { user: { select: commentAuthorInclude } },
      });
    });

    return {
      success: true,
      message: "Reply posted successfully",
      data: {
        id: reply!.id,
        postId: reply!.postId,
        parentId: reply!.parentId,
        content: reply!.content,
        helpfulCount: reply!.helpfulCount,
        solvedCount: reply!.solvedCount,
        createdAt: reply!.createdAt,
        author: formatCommentAuthor(reply!.user),
      },
    };
  },

  async getComments(postId: string, query: any) {
    const validated: GetCommentsInput = getCommentsSchema.parse(query);

    const page = validated.page || 1;
    const limit = Math.min(validated.limit || 10, 20);
    const skip = (page - 1) * limit;

    const post = await prisma.post.findUnique({
      where: { id: postId },
      select: { id: true },
    });

    if (!post) {
      return {
        success: false,
        message: "Post not found",
      };
    }

    const [comments, total] = await Promise.all([
      prisma.comment.findMany({
        where: { postId, parentId: null },
        orderBy: { createdAt: "asc" }, // oldest first, so a thread reads top to bottom
        skip,
        take: limit,
        include: {
          user: { select: commentAuthorInclude },
          replies: {
            orderBy: { createdAt: "asc" },
            include: { user: { select: commentAuthorInclude } },
          },
        },
      }),
      prisma.comment.count({ where: { postId, parentId: null } }),
    ]);

    const data = comments.map((comment) => ({
      id: comment.id,
      postId: comment.postId,
      parentId: comment.parentId,
      content: comment.content,
      helpfulCount: comment.helpfulCount,
      solvedCount: comment.solvedCount,
      createdAt: comment.createdAt,
      author: formatCommentAuthor(comment.user),
      replies: comment.replies.map((reply) => ({
        id: reply.id,
        postId: reply.postId,
        parentId: reply.parentId,
        content: reply.content,
        helpfulCount: reply.helpfulCount,
        solvedCount: reply.solvedCount,
        createdAt: reply.createdAt,
        author: formatCommentAuthor(reply.user),
      })),
    }));

    return {
      success: true,
      message:
        total > 0
          ? "Comments retrieved successfully"
          : "No comments yet. Be the first to respond!",
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 0,
      },
    };
  },

  async deleteComment(userId: string, commentId: string) {
    const comment = await prisma.comment.findUnique({
      where: { id: commentId },
      select: { id: true, userId: true, postId: true },
    });

    if (!comment) {
      return {
        success: false,
        message: "Comment not found",
      };
    }

    if (comment.userId !== userId) {
      return {
        success: false,
        message: "You can only delete your own comments",
      };
    }

    // Count direct replies so Post.commentsCount can be decremented by the
    // correct total. If this comment is itself a reply, repliesCount is
    // always 0, since replies cannot have their own replies.
    const repliesCount = await prisma.comment.count({
      where: { parentId: commentId },
    });

    const totalToRemove = 1 + repliesCount;

    // Transaction needed: the delete and the commentsCount decrement on Post
    // must both happen, or the post's displayed comment count drifts out of
    // sync with what's actually in the database.
    await prisma.$transaction(async (tx) => {
      await tx.comment.delete({ where: { id: commentId } });

      await tx.post.update({
        where: { id: comment.postId },
        data: { commentsCount: { decrement: totalToRemove } },
      });
    });

    return {
      success: true,
      message: "Comment deleted successfully",
    };
  },

  async markComment(
    actingUserId: string,
    commentId: string,
    type: CommentMarkType,
  ) {
    const comment = await prisma.comment.findUnique({
      where: { id: commentId },
      select: {
        id: true,
        postId: true,
        userId: true,
        post: { select: { userId: true } },
      },
    });

    if (!comment) {
      return { success: false, message: "Comment not found" };
    }

    if (comment.post.userId !== actingUserId) {
      return {
        success: false,
        message: "Only the post author can mark comments as helpful or solved",
      };
    }

    if (comment.userId === actingUserId) {
      return {
        success: false,
        message: "You cannot mark your own comment",
      };
    }

    // Prisma generates this compound-key name as "userId_commentId_type" from
    // the @@unique([userId, commentId, type]) line in schema.prisma
    const existingMark = await prisma.commentMark.findUnique({
      where: {
        userId_commentId_type: {
          userId: actingUserId,
          commentId,
          type,
        },
      },
    });

    if (existingMark) {
      return {
        success: false,
        message: `You have already marked this comment as ${type.toLowerCase()}`,
      };
    }

    const reputationPoints = type === "HELPFUL" ? 1 : 2;

    // Transaction is required: creating the mark, bumping the comment's own
    // counter, bumping the author's reputation, and creating the notification
    // must all succeed together, otherwise reputation and marks fall out of
    // sync (e.g. a mark exists but reputation was never awarded).
    const updatedComment = await prisma.$transaction(async (tx) => {
      await tx.commentMark.create({
        data: { userId: actingUserId, commentId, type },
      });

      const comment = await tx.comment.update({
        where: { id: commentId },
        data:
          type === "HELPFUL"
            ? { helpfulCount: { increment: 1 } }
            : { solvedCount: { increment: 1 } },
      });

      await tx.profile.update({
        where: { userId: comment.userId },
        data: {
          reputationScore: { increment: reputationPoints },
          ...(type === "HELPFUL"
            ? { helpfulAnswersCount: { increment: 1 } }
            : { solvedAnswersCount: { increment: 1 } }),
        },
      });

      await tx.notification.create({
        data: {
          userId: comment.userId,
          type: "COMMENT_MARKED",
          title:
            type === "HELPFUL"
              ? "Your comment was marked Helpful"
              : "Your comment solved a problem",
          message:
            type === "HELPFUL"
              ? "Someone found your comment helpful. Keep sharing what you know!"
              : "Your comment was marked as solving the problem. Great work!",
          priority: "LOW",
          actionLink: `/community/posts/${comment.postId}`,
          metadata: { commentId, markType: type },
        },
      });

      return comment;
    });

    return {
      success: true,
      message: `Comment marked as ${type.toLowerCase()} successfully`,
      data: {
        commentId: updatedComment.id,
        helpfulCount: updatedComment.helpfulCount,
        solvedCount: updatedComment.solvedCount,
      },
    };
  },

  async unmarkComment(
    actingUserId: string,
    commentId: string,
    type: CommentMarkType,
  ) {
    const existingMark = await prisma.commentMark.findUnique({
      where: {
        userId_commentId_type: {
          userId: actingUserId,
          commentId,
          type,
        },
      },
    });

    if (!existingMark) {
      return {
        success: false,
        message:
          "You have not marked this comment, so there is nothing to remove",
      };
    }

    const comment = await prisma.comment.findUnique({
      where: { id: commentId },
      select: { userId: true, helpfulCount: true, solvedCount: true },
    });

    if (!comment) {
      return { success: false, message: "Comment not found" };
    }

    const reputationPoints = type === "HELPFUL" ? 1 : 2;

    await prisma.$transaction(async (tx) => {
      await tx.commentMark.delete({
        where: {
          userId_commentId_type: {
            userId: actingUserId,
            commentId,
            type,
          },
        },
      });

      await tx.comment.update({
        where: { id: commentId },
        data:
          type === "HELPFUL"
            ? { helpfulCount: Math.max(0, comment.helpfulCount - 1) }
            : { solvedCount: Math.max(0, comment.solvedCount - 1) },
      });

      const profile = await tx.profile.findUnique({
        where: { userId: comment.userId },
      });

      if (profile) {
        await tx.profile.update({
          where: { userId: comment.userId },
          data: {
            reputationScore: Math.max(
              0,
              profile.reputationScore - reputationPoints,
            ),
            ...(type === "HELPFUL"
              ? {
                  helpfulAnswersCount: Math.max(
                    0,
                    profile.helpfulAnswersCount - 1,
                  ),
                }
              : {
                  solvedAnswersCount: Math.max(
                    0,
                    profile.solvedAnswersCount - 1,
                  ),
                }),
          },
        });
      }
    });

    return {
      success: true,
      message: `${type === "HELPFUL" ? "Helpful" : "Solved"} mark removed successfully`,
    };
  },

  async likePost(userId: string, postId: string) {
    const post = await prisma.post.findUnique({
      where: { id: postId },
      select: { id: true, userId: true },
    });

    if (!post) {
      return { success: false, message: "Post not found" };
    }

    const existingLike = await prisma.postLike.findUnique({
      where: { userId_postId: { userId, postId } },
    });

    if (existingLike) {
      return { success: false, message: "You have already liked this post" };
    }

    await prisma.$transaction(async (tx) => {
      await tx.postLike.create({ data: { userId, postId } });

      await tx.post.update({
        where: { id: postId },
        data: { likesCount: { increment: 1 } },
      });

      // Only notify if someone else liked the post; liking your own post
      // (which is allowed) should never generate a notification to yourself
      if (post.userId !== userId) {
        await tx.notification.create({
          data: {
            userId: post.userId,
            type: "POST_LIKED",
            title: "Someone liked your post",
            message: "Your post got a new like in the community.",
            priority: "LOW",
            actionLink: `/community/posts/${postId}`,
            metadata: { postId, likedBy: userId },
          },
        });
      }
    });

    return { success: true, message: "Post liked successfully" };
  },

  async unlikePost(userId: string, postId: string) {
    const existingLike = await prisma.postLike.findUnique({
      where: { userId_postId: { userId, postId } },
    });

    if (!existingLike) {
      return { success: false, message: "You have not liked this post" };
    }

    const post = await prisma.post.findUnique({
      where: { id: postId },
      select: { likesCount: true },
    });

    if (!post) {
      return { success: false, message: "Post not found" };
    }

    await prisma.$transaction(async (tx) => {
      await tx.postLike.delete({
        where: { userId_postId: { userId, postId } },
      });

      // Set an explicit floored value instead of using { decrement: 1 },
      // so likesCount can never go negative if this ever runs twice in a race
      await tx.post.update({
        where: { id: postId },
        data: { likesCount: Math.max(0, post.likesCount - 1) },
      });
    });

    return { success: true, message: "Post unliked successfully" };
  },

  async getPostLikes(postId: string, query: any) {
    const validated: GetPostLikesInput = getPostLikesSchema.parse(query);

    const page = validated.page || 1;
    const limit = Math.min(validated.limit || 20, 50);
    const skip = (page - 1) * limit;

    const post = await prisma.post.findUnique({
      where: { id: postId },
      select: { id: true },
    });

    if (!post) {
      return { success: false, message: "Post not found" };
    }

    const [likes, total] = await Promise.all([
      prisma.postLike.findMany({
        where: { postId },
        orderBy: { createdAt: "desc" }, // most recent likers first
        skip,
        take: limit,
        include: { user: { select: commentAuthorInclude } },
      }),
      prisma.postLike.count({ where: { postId } }),
    ]);

    const data = likes.map((like) => formatCommentAuthor(like.user));

    return {
      success: true,
      message:
        total > 0
          ? "Likes retrieved successfully"
          : "No likes on this post yet",
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 0,
      },
    };
  },

  async savePost(userId: string, postId: string) {
    const post = await prisma.post.findUnique({
      where: { id: postId },
      select: { id: true },
    });

    if (!post) {
      return { success: false, message: "Post not found" };
    }

    const existingSave = await prisma.savedPost.findUnique({
      where: { userId_postId: { userId, postId } },
    });

    if (existingSave) {
      return { success: false, message: "You have already saved this post" };
    }

    // Transaction required for the same reason as likePost: the SavedPost row
    // and Post.savesCount must stay in sync with each other
    await prisma.$transaction(async (tx) => {
      await tx.savedPost.create({ data: { userId, postId } });

      await tx.post.update({
        where: { id: postId },
        data: { savesCount: { increment: 1 } },
      });
    });

    return { success: true, message: "Post saved successfully" };
  },

  async unsavePost(userId: string, postId: string) {
    const existingSave = await prisma.savedPost.findUnique({
      where: { userId_postId: { userId, postId } },
    });

    if (!existingSave) {
      return { success: false, message: "You have not saved this post" };
    }

    const post = await prisma.post.findUnique({
      where: { id: postId },
      select: { savesCount: true },
    });

    if (!post) {
      return { success: false, message: "Post not found" };
    }

    await prisma.$transaction(async (tx) => {
      await tx.savedPost.delete({
        where: { userId_postId: { userId, postId } },
      });

      await tx.post.update({
        where: { id: postId },
        data: { savesCount: Math.max(0, post.savesCount - 1) },
      });
    });

    return { success: true, message: "Post unsaved successfully" };
  },

  async getSavedPosts(userId: string, query: any) {
    const validated: GetSavedPostsInput = getSavedPostsSchema.parse(query);

    const page = validated.page || 1;
    const limit = Math.min(validated.limit || 10, 20);
    const skip = (page - 1) * limit;

    const [savedEntries, total] = await Promise.all([
      prisma.savedPost.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" }, // most recently saved first
        skip,
        take: limit,
        include: {
          post: {
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
                  tag: { select: { id: true, name: true, slug: true } },
                },
              },
            },
          },
        },
      }),
      prisma.savedPost.count({ where: { userId } }),
    ]);

    const data = savedEntries.map((entry) => ({
      savedAt: entry.createdAt,
      id: entry.post.id,
      content: entry.post.content,
      imageUrls: entry.post.imageUrls,
      region: entry.post.region,
      cropType: entry.post.cropType,
      likesCount: entry.post.likesCount,
      commentsCount: entry.post.commentsCount,
      savesCount: entry.post.savesCount,
      createdAt: entry.post.createdAt,
      author: {
        id: entry.post.user.id,
        fullName: entry.post.user.profile?.fullName ?? "Unknown",
        avatarUrl: entry.post.user.profile?.avatarUrl ?? null,
        reputationScore: entry.post.user.profile?.reputationScore ?? 0,
      },
      tags: entry.post.tags.map((pt) => ({
        id: pt.tag.id,
        name: pt.tag.name,
        slug: pt.tag.slug,
      })),
    }));

    return {
      success: true,
      message:
        total > 0
          ? "Saved posts retrieved successfully"
          : "You have not saved any posts yet",
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 0,
      },
    };
  },

  async followUser(followerId: string, targetUserId: string) {
    // Prevent self-follow
    if (followerId === targetUserId) {
      return {
        success: false,
        message: "You cannot follow yourself",
      };
    }

    // Check target user exists
    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: {
        id: true,
        profile: { select: { fullName: true } },
      },
    });

    if (!targetUser) {
      return {
        success: false,
        message: "User not found",
      };
    }

    // Idempotent check: already following?
    const existing = await prisma.follow.findUnique({
      where: {
        followerId_followingId: {
          followerId,
          followingId: targetUserId,
        },
      },
    });

    if (existing) {
      // Already following → still return success + current counts so UI stays in sync
      const followersCount = await prisma.follow.count({
        where: { followingId: targetUserId },
      });

      return {
        success: true,
        message: "Already following this user",
        isFollowing: true,
        followersCount,
      };
    }

    // Create follow + notification in one transaction
    // Transaction is used because both the Follow row and the Notification must succeed together
    await prisma.$transaction(async (tx) => {
      await tx.follow.create({
        data: {
          followerId,
          followingId: targetUserId,
        },
      });

      // Only notify the person being followed
      await tx.notification.create({
        data: {
          userId: targetUserId,
          type: "USER_FOLLOWED",
          title: "New follower",
          message: `${targetUser.profile?.fullName ?? "Someone"} started following you`,
          // Note: the message above uses the target's own name by mistake in the original thought.
          // We fix it below by fetching the follower's name.
          priority: "LOW",
          actionLink: `/community/users/${followerId}`,
          metadata: { followerId },
        },
      });
    });

    const follower = await prisma.user.findUnique({
      where: { id: followerId },
      select: { profile: { select: { fullName: true } } },
    });

    await prisma.$transaction(async (tx) => {
      await tx.follow.create({
        data: {
          followerId,
          followingId: targetUserId,
        },
      });

      await tx.notification.create({
        data: {
          userId: targetUserId,
          type: "USER_FOLLOWED",
          title: "New follower",
          message: `${follower?.profile?.fullName ?? "Someone"} started following you`,
          priority: "LOW",
          actionLink: `/community/users/${followerId}`,
          metadata: { followerId },
        },
      });
    });

    const followersCount = await prisma.follow.count({
      where: { followingId: targetUserId },
    });

    return {
      success: true,
      message: "You are now following this user",
      isFollowing: true,
      followersCount,
    };
  },

  // Unfollow a user
  async unfollowUser(followerId: string, targetUserId: string) {
    const existing = await prisma.follow.findUnique({
      where: {
        followerId_followingId: {
          followerId,
          followingId: targetUserId,
        },
      },
    });

    if (!existing) {
      // Idempotent: already not following
      const followersCount = await prisma.follow.count({
        where: { followingId: targetUserId },
      });

      return {
        success: true,
        message: "You are not following this user",
        isFollowing: false,
        followersCount,
      };
    }

    await prisma.follow.delete({
      where: {
        followerId_followingId: {
          followerId,
          followingId: targetUserId,
        },
      },
    });

    const followersCount = await prisma.follow.count({
      where: { followingId: targetUserId },
    });

    return {
      success: true,
      message: "You have unfollowed this user",
      isFollowing: false,
      followersCount,
    };
  },

  // Follow a tag
  async followTag(userId: string, tagId: string) {
    const tag = await prisma.tag.findUnique({
      where: { id: tagId },
      select: { id: true, name: true },
    });

    if (!tag) {
      return {
        success: false,
        message: "Tag not found",
      };
    }

    const existing = await prisma.tagFollow.findUnique({
      where: {
        userId_tagId: {
          userId,
          tagId,
        },
      },
    });

    if (existing) {
      return {
        success: true,
        message: "Already following this tag",
        isFollowing: true,
      };
    }

    await prisma.tagFollow.create({
      data: {
        userId,
        tagId,
      },
    });

    return {
      success: true,
      message: `You are now following the tag "${tag.name}"`,
      isFollowing: true,
    };
  },

  // Unfollow a tag
  async unfollowTag(userId: string, tagId: string) {
    const existing = await prisma.tagFollow.findUnique({
      where: {
        userId_tagId: {
          userId,
          tagId,
        },
      },
    });

    if (!existing) {
      return {
        success: true,
        message: "You are not following this tag",
        isFollowing: false,
      };
    }

    await prisma.tagFollow.delete({
      where: {
        userId_tagId: {
          userId,
          tagId,
        },
      },
    });

    return {
      success: true,
      message: "You have unfollowed this tag",
      isFollowing: false,
    };
  },

  // List followers of a user (public)
  // currentUserId is optional — when present we also return isFollowing for each person
  // so the UI can show "Follow back" buttons easily
  async getFollowers(targetUserId: string, query: any, currentUserId?: string) {
    const validated = getFollowersSchema.parse(query);
    const page = validated.page || 1;
    const limit = Math.min(validated.limit || 20, 50);
    const skip = (page - 1) * limit;

    // Confirm the target user exists
    const targetExists = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true },
    });

    if (!targetExists) {
      return {
        success: false,
        message: "User not found",
      };
    }

    const [follows, total] = await Promise.all([
      prisma.follow.findMany({
        where: { followingId: targetUserId },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        include: {
          follower: {
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
        },
      }),
      prisma.follow.count({ where: { followingId: targetUserId } }),
    ]);

    // If the requester is logged in, check which of these people they already follow
    let followingSet = new Set<string>();
    if (currentUserId && follows.length > 0) {
      const ids = follows.map((f) => f.followerId);
      const myFollows = await prisma.follow.findMany({
        where: {
          followerId: currentUserId,
          followingId: { in: ids },
        },
        select: { followingId: true },
      });
      followingSet = new Set(myFollows.map((f) => f.followingId));
    }

    const data = follows.map((f) => ({
      id: f.follower.id,
      fullName: f.follower.profile?.fullName ?? "Unknown",
      avatarUrl: f.follower.profile?.avatarUrl ?? null,
      reputationScore: f.follower.profile?.reputationScore ?? 0,
      followedAt: f.createdAt,
      // Only present when the requester is logged in
      ...(currentUserId && {
        isFollowing: followingSet.has(f.follower.id),
      }),
    }));

    return {
      success: true,
      message:
        total > 0
          ? "Followers retrieved successfully"
          : "This user has no followers yet",
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 0,
      },
    };
  },

  // List users that a given user is following (public)
  async getFollowing(targetUserId: string, query: any, currentUserId?: string) {
    const validated = getFollowingSchema.parse(query);
    const page = validated.page || 1;
    const limit = Math.min(validated.limit || 20, 50);
    const skip = (page - 1) * limit;

    const targetExists = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true },
    });

    if (!targetExists) {
      return {
        success: false,
        message: "User not found",
      };
    }

    const [follows, total] = await Promise.all([
      prisma.follow.findMany({
        where: { followerId: targetUserId },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        include: {
          following: {
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
        },
      }),
      prisma.follow.count({ where: { followerId: targetUserId } }),
    ]);

    // Same optional isFollowing enrichment for the requester
    let followingSet = new Set<string>();
    if (currentUserId && follows.length > 0) {
      const ids = follows.map((f) => f.followingId);
      const myFollows = await prisma.follow.findMany({
        where: {
          followerId: currentUserId,
          followingId: { in: ids },
        },
        select: { followingId: true },
      });
      followingSet = new Set(myFollows.map((f) => f.followingId));
    }

    const data = follows.map((f) => ({
      id: f.following.id,
      fullName: f.following.profile?.fullName ?? "Unknown",
      avatarUrl: f.following.profile?.avatarUrl ?? null,
      reputationScore: f.following.profile?.reputationScore ?? 0,
      followedAt: f.createdAt,
      ...(currentUserId && {
        isFollowing: followingSet.has(f.following.id),
      }),
    }));

    return {
      success: true,
      message:
        total > 0
          ? "Following list retrieved successfully"
          : "This user is not following anyone yet",
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 0,
      },
    };
  },

  // List tags the current user is following (auth required)
  async getMyFollowingTags(userId: string, query: any) {
    const validated = getMyFollowingTagsSchema.parse(query);
    const page = validated.page || 1;
    const limit = Math.min(validated.limit || 20, 50);
    const skip = (page - 1) * limit;

    const [tagFollows, total] = await Promise.all([
      prisma.tagFollow.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        include: {
          tag: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
        },
      }),
      prisma.tagFollow.count({ where: { userId } }),
    ]);

    const data = tagFollows.map((tf) => ({
      id: tf.tag.id,
      name: tf.tag.name,
      slug: tf.tag.slug,
      followedAt: tf.createdAt,
      isFollowing: true, // always true for this endpoint
    }));

    return {
      success: true,
      message:
        total > 0
          ? "Followed tags retrieved successfully"
          : "You are not following any tags yet",
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
