// controllers/communityController.ts
import type { Request, Response } from "express";
import { communityService } from "../services/communityService.js";
import { prisma } from "../config/connectDb.js";
import { getMyPostsSchema } from "../schema/communitySchema.js";

export const communityController = {
  async createPost(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;
      const files = (req.files as Express.Multer.File[]) || [];

      const result = await communityService.createPost(userId, req.body, files);

      res.status(201).json(result);
    } catch (error: any) {
      console.error(
        "❗Error in createPost:",
        error.message || "createPost failed",
      );

      // Friendly error messages
      const message =
        error.message || "Failed to create post. Please try again.";

      res.status(400).json({
        success: false,
        message,
      });
    }
  },

  async getAllTags(req: Request, res: Response) {
    try {
      const result = await communityService.getAllTags();
      res.status(200).json(result);
    } catch (error: any) {
      console.error(
        "❗Error in getAllTags:",
        error.message || "getAllTags failed",
      );
      res.status(500).json({
        success: false,
        message: "Failed to retrieve tags. Please try again.",
      });
    }
  },

  async getPostById(req: Request, res: Response) {
    try {
      const { postId } = req.params;
      const currentUserId = req.user?.userId; // undefined if guest

      const result = await communityService.getPostById(
        postId as string,
        currentUserId,
      );

      if (!result.success) {
        return res.status(404).json(result);
      }

      res.status(200).json(result);
    } catch (error: any) {
      console.error(
        "❗Error in getPostById:",
        error.message || "getPostById failed",
      );
      res.status(500).json({
        success: false,
        message: "Failed to retrieve post. Please try again.",
      });
    }
  },

  async getMyPosts(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;
      const result = await communityService.getMyPosts(userId, req.query);
      res.status(200).json(result);
    } catch (error: any) {
      console.error(
        "❗Error in getMyPosts:",
        error.message || "getMyPosts failed",
      );
      res.status(400).json({
        success: false,
        message: error.message || "Failed to retrieve your posts",
      });
    }
  },

  async deletePost(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;
      const { postId } = req.params;

      const result = await communityService.deletePost(
        userId,
        postId as string,
      );

      if (!result.success) {
        const status = result.message === "Post not found" ? 404 : 403;
        return res.status(status).json(result);
      }

      res.status(200).json(result);
    } catch (error: any) {
      console.error(
        "❗Error in deletePost:",
        error.message || "deletePost failed",
      );
      res.status(500).json({
        success: false,
        message: "Failed to delete post. Please try again.",
      });
    }
  },

  async getPosts(req: Request, res: Response) {
    try {
      const currentUserId = req.user?.userId;

      const result = await communityService.getPosts(req.query, currentUserId);

      res.status(200).json(result);
    } catch (error: any) {
      console.error("❗Error in getPosts:", error.message || "getPosts failed");
      res.status(400).json({
        success: false,
        message: error.message || "Failed to retrieve posts. Please try again.",
      });
    }
  },

  async createComment(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;
      const { postId } = req.params;

      const result = await communityService.createComment(
        userId,
        postId as string,
        req.body,
      );

      res.status(201).json(result);
    } catch (error: any) {
      console.error(
        "❗Error in createComment:",
        error.message || "createComment failed",
      );

      const status = error.message === "Post not found" ? 404 : 400;

      res.status(status).json({
        success: false,
        message: error.message || "Failed to post comment. Please try again.",
      });
    }
  },

  async createReply(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;
      const { commentId } = req.params;

      const result = await communityService.createReply(
        userId,
        commentId as string,
        req.body,
      );

      res.status(201).json(result);
    } catch (error: any) {
      console.error(
        "❗Error in createReply:",
        error.message || "createReply failed",
      );

      const status = error.message === "Comment not found" ? 404 : 400;

      res.status(status).json({
        success: false,
        message: error.message || "Failed to post reply. Please try again.",
      });
    }
  },

  async getComments(req: Request, res: Response) {
    try {
      const { postId } = req.params;

      const result = await communityService.getComments(
        postId as string,
        req.query,
      );

      if (!result.success) {
        return res.status(404).json(result);
      }

      res.status(200).json(result);
    } catch (error: any) {
      console.error(
        "❗Error in getComments:",
        error.message || "getComments failed",
      );
      res.status(400).json({
        success: false,
        message:
          error.message || "Failed to retrieve comments. Please try again.",
      });
    }
  },

  async deleteComment(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;
      const { commentId } = req.params;

      const result = await communityService.deleteComment(
        userId,
        commentId as string,
      );

      if (!result.success) {
        const status = result.message === "Comment not found" ? 404 : 403;
        return res.status(status).json(result);
      }

      res.status(200).json(result);
    } catch (error: any) {
      console.error(
        "❗Error in deleteComment:",
        error.message || "deleteComment failed",
      );
      res.status(500).json({
        success: false,
        message: "Failed to delete comment. Please try again.",
      });
    }
  },

  async markCommentHelpful(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;
      const { commentId } = req.params;

      const result = await communityService.markComment(
        userId,
        commentId as string,
        "HELPFUL",
      );

      if (!result.success) {
        const status = getMarkErrorStatus(result.message);
        return res.status(status).json(result);
      }

      res.status(200).json(result);
    } catch (error: any) {
      console.error(
        "❗Error in markCommentHelpful:",
        error.message || "markCommentHelpful failed",
      );
      res.status(500).json({
        success: false,
        message: "Failed to mark comment as helpful. Please try again.",
      });
    }
  },

  async markCommentSolved(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;
      const { commentId } = req.params;

      const result = await communityService.markComment(
        userId,
        commentId as string,
        "SOLVED",
      );

      if (!result.success) {
        const status = getMarkErrorStatus(result.message);
        return res.status(status).json(result);
      }

      res.status(200).json(result);
    } catch (error: any) {
      console.error(
        "❗Error in markCommentSolved:",
        error.message || "markCommentSolved failed",
      );
      res.status(500).json({
        success: false,
        message: "Failed to mark comment as solved. Please try again.",
      });
    }
  },

  async unmarkCommentHelpful(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;
      const { commentId } = req.params;

      const result = await communityService.unmarkComment(
        userId,
        commentId as string,
        "HELPFUL",
      );

      if (!result.success) {
        return res.status(404).json(result);
      }

      res.status(200).json(result);
    } catch (error: any) {
      console.error(
        "❗Error in unmarkCommentHelpful:",
        error.message || "unmarkCommentHelpful failed",
      );
      res.status(500).json({
        success: false,
        message: "Failed to remove helpful mark. Please try again.",
      });
    }
  },

  async unmarkCommentSolved(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;
      const { commentId } = req.params;

      const result = await communityService.unmarkComment(
        userId,
        commentId as string,
        "SOLVED",
      );

      if (!result.success) {
        return res.status(404).json(result);
      }

      res.status(200).json(result);
    } catch (error: any) {
      console.error(
        "❗Error in unmarkCommentSolved:",
        error.message || "unmarkCommentSolved failed",
      );
      res.status(500).json({
        success: false,
        message: "Failed to remove solved mark. Please try again.",
      });
    }
  },

  async likePost(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;
      const { postId } = req.params;

      const result = await communityService.likePost(userId, postId as string);

      if (!result.success) {
        const status = getLikeSaveErrorStatus(result.message);
        return res.status(status).json(result);
      }

      res.status(200).json(result);
    } catch (error: any) {
      console.error("❗Error in likePost:", error.message || "likePost failed");
      res.status(500).json({
        success: false,
        message: "Failed to like post. Please try again.",
      });
    }
  },

  async unlikePost(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;
      const { postId } = req.params;

      const result = await communityService.unlikePost(
        userId,
        postId as string,
      );

      if (!result.success) {
        const status = getLikeSaveErrorStatus(result.message);
        return res.status(status).json(result);
      }

      res.status(200).json(result);
    } catch (error: any) {
      console.error(
        "❗Error in unlikePost:",
        error.message || "unlikePost failed",
      );
      res.status(500).json({
        success: false,
        message: "Failed to unlike post. Please try again.",
      });
    }
  },

  async getPostLikes(req: Request, res: Response) {
    try {
      const { postId } = req.params;

      const result = await communityService.getPostLikes(
        postId as string,
        req.query,
      );

      if (!result.success) {
        return res.status(404).json(result);
      }

      res.status(200).json(result);
    } catch (error: any) {
      console.error(
        "❗Error in getPostLikes:",
        error.message || "getPostLikes failed",
      );
      res.status(400).json({
        success: false,
        message: error.message || "Failed to retrieve likes. Please try again.",
      });
    }
  },

  async savePost(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;
      const { postId } = req.params;

      const result = await communityService.savePost(userId, postId as string);

      if (!result.success) {
        const status = getLikeSaveErrorStatus(result.message);
        return res.status(status).json(result);
      }

      res.status(200).json(result);
    } catch (error: any) {
      console.error("❗Error in savePost:", error.message || "savePost failed");
      res.status(500).json({
        success: false,
        message: "Failed to save post. Please try again.",
      });
    }
  },

  async unsavePost(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;
      const { postId } = req.params;

      const result = await communityService.unsavePost(
        userId,
        postId as string,
      );

      if (!result.success) {
        const status = getLikeSaveErrorStatus(result.message);
        return res.status(status).json(result);
      }

      res.status(200).json(result);
    } catch (error: any) {
      console.error(
        "❗Error in unsavePost:",
        error.message || "unsavePost failed",
      );
      res.status(500).json({
        success: false,
        message: "Failed to unsave post. Please try again.",
      });
    }
  },

  async getSavedPosts(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;

      const result = await communityService.getSavedPosts(userId, req.query);

      res.status(200).json(result);
    } catch (error: any) {
      console.error(
        "❗Error in getSavedPosts:",
        error.message || "getSavedPosts failed",
      );
      res.status(400).json({
        success: false,
        message:
          error.message || "Failed to retrieve saved posts. Please try again.",
      });
    }
  },

  async followUser(req: Request, res: Response) {
    try {
      const followerId = req.user!.userId;
      const { userId: targetUserId } = req.params;

      const result = await communityService.followUser(
        followerId,
        targetUserId as string,
      );

      if (!result.success) {
        // 400 for self-follow, 404 for user not found
        const status = result.message === "User not found" ? 404 : 400;
        return res.status(status).json(result);
      }

      res.status(200).json(result);
    } catch (error: any) {
      console.error(
        "❗Error in followUser:",
        error.message || "followUser failed",
      );
      res.status(500).json({
        success: false,
        message: "Failed to follow user. Please try again.",
      });
    }
  },

  //  Unfollow a user
  async unfollowUser(req: Request, res: Response) {
    try {
      const followerId = req.user!.userId;
      const { userId: targetUserId } = req.params;

      const result = await communityService.unfollowUser(
        followerId,
        targetUserId as string,
      );

      res.status(200).json(result);
    } catch (error: any) {
      console.error(
        "❗Error in unfollowUser:",
        error.message || "unfollowUser failed",
      );
      res.status(500).json({
        success: false,
        message: "Failed to unfollow user. Please try again.",
      });
    }
  },

  //  Follow a tag
  async followTag(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;
      const { tagId } = req.params;

      const result = await communityService.followTag(userId, tagId as string);

      if (!result.success) {
        return res.status(404).json(result);
      }

      res.status(200).json(result);
    } catch (error: any) {
      console.error(
        "❗Error in followTag:",
        error.message || "followTag failed",
      );
      res.status(500).json({
        success: false,
        message: "Failed to follow tag. Please try again.",
      });
    }
  },

  //  Unfollow a tag
  async unfollowTag(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;
      const { tagId } = req.params;

      const result = await communityService.unfollowTag(
        userId,
        tagId as string,
      );

      res.status(200).json(result);
    } catch (error: any) {
      console.error(
        "❗Error in unfollowTag:",
        error.message || "unfollowTag failed",
      );
      res.status(500).json({
        success: false,
        message: "Failed to unfollow tag. Please try again.",
      });
    }
  },

  //  Get followers of a user (public + optional auth for isFollowing)
  async getFollowers(req: Request, res: Response) {
    try {
      const { userId } = req.params;
      const currentUserId = req.user?.userId; // undefined when guest

      const result = await communityService.getFollowers(
        userId as string,
        req.query,
        currentUserId,
      );

      if (!result.success) {
        return res.status(404).json(result);
      }

      res.status(200).json(result);
    } catch (error: any) {
      console.error(
        "❗Error in getFollowers:",
        error.message || "getFollowers failed",
      );
      res.status(400).json({
        success: false,
        message: error.message || "Failed to retrieve followers",
      });
    }
  },

  //  Get users that a user is following (public)
  async getFollowing(req: Request, res: Response) {
    try {
      const { userId } = req.params;
      const currentUserId = req.user?.userId;

      const result = await communityService.getFollowing(
        userId as string,
        req.query,
        currentUserId,
      );

      if (!result.success) {
        return res.status(404).json(result);
      }

      res.status(200).json(result);
    } catch (error: any) {
      console.error(
        "❗Error in getFollowing:",
        error.message || "getFollowing failed",
      );
      res.status(400).json({
        success: false,
        message: error.message || "Failed to retrieve following list",
      });
    }
  },

  //  Get tags the current user is following
  async getMyFollowingTags(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;

      const result = await communityService.getMyFollowingTags(
        userId,
        req.query,
      );

      res.status(200).json(result);
    } catch (error: any) {
      console.error(
        "❗Error in getMyFollowingTags:",
        error.message || "getMyFollowingTags failed",
      );
      res.status(400).json({
        success: false,
        message: error.message || "Failed to retrieve followed tags",
      });
    }
  },

  async getFollowingPosts(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;

      const result = await communityService.getFollowingPosts(
        userId,
        req.query,
      );

      res.status(200).json(result);
    } catch (error: any) {
      console.error(
        "❗Error in getFollowingPosts:",
        error.message || "getFollowingPosts failed",
      );
      res.status(400).json({
        success: false,
        message:
          error.message ||
          "Failed to retrieve following feed. Please try again.",
      });
    }
  },

  async getPopularPosts(req: Request, res: Response) {
    try {
      const currentUserId = req.user?.userId;

      const result = await communityService.getPopularPosts(
        req.query,
        currentUserId,
      );

      res.status(200).json(result);
    } catch (error: any) {
      console.error(
        "❗Error in getPopularPosts:",
        error.message || "getPopularPosts failed",
      );
      res.status(400).json({
        success: false,
        message:
          error.message ||
          "Failed to retrieve popular posts. Please try again.",
      });
    }
  },

  async getUserProfile(req: Request, res: Response) {
    try {
      const { userId } = req.params;
      const currentUserId = req.user?.userId;

      const result = await communityService.getUserProfile(
        userId as string,
        currentUserId,
      );

      if (!result.success) {
        return res.status(404).json(result);
      }

      res.status(200).json(result);
    } catch (error: any) {
      console.error(
        "❗Error in getUserProfile:",
        error.message || "getUserProfile failed",
      );
      res.status(400).json({
        success: false,
        message:
          error.message || "Failed to retrieve user profile. Please try again.",
      });
    }
  },
  async getUserPosts(req: Request, res: Response) {
    try {
      const { userId } = req.params;
      const currentUserId = req.user?.userId;

      const result = await communityService.getUserPosts(
        userId as string,
        req.query,
        currentUserId,
      );

      if (!result.success) {
        return res.status(404).json(result);
      }

      res.status(200).json(result);
    } catch (error: any) {
      console.error(
        "❗Error in getUserPosts:",
        error.message || "getUserPosts failed",
      );
      res.status(400).json({
        success: false,
        message:
          error.message || "Failed to retrieve user posts. Please try again.",
      });
    }
  },
};

function getMarkErrorStatus(message: string): number {
  if (message === "Comment not found") return 404;
  if (message.startsWith("Only the post author")) return 403;
  if (message === "You cannot mark your own comment") return 403;
  if (message.startsWith("You have already marked")) return 409; // 409 = Conflict, the mark already exists
  return 400;
}

function getLikeSaveErrorStatus(message: string): number {
  if (message === "Post not found") return 404;
  if (message.startsWith("You have already")) return 409; // 409 = Conflict, already liked/saved
  if (message.startsWith("You have not")) return 404; // nothing to unlike/unsave
  return 400;
}
