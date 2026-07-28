// services/communityService.ts
import { v2 as cloudinary } from "cloudinary";
import { prisma } from "../config/connectDb.js";
import {
  createPostSchema,
  type CreatePostInput,
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
};
