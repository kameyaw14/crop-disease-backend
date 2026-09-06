// routes/communityRoutes.ts
import express from "express";
import { optionalAuth, protect } from "../middleware/authMiddleware.js";
import { uploadPostImages } from "../middleware/upload.js";
import { communityController } from "../controllers/communityController.js";

const communityRouter = express.Router();

communityRouter.get("/tags", communityController.getAllTags);

communityRouter.post(
  "/posts",
  protect,
  uploadPostImages,
  communityController.createPost,
);

communityRouter.get(
  "/posts",
  optionalAuth, // public read + isLiked/isSaved when logged in
  communityController.getPosts,
);

communityRouter.get(
  "/posts/following",
  protect,
  communityController.getFollowingPosts,
);

communityRouter.get(
  "/posts/popular",
  optionalAuth,
  communityController.getPopularPosts,
);

communityRouter.get("/saved", protect, communityController.getSavedPosts);

communityRouter.get(
  "/posts/:postId",
  optionalAuth,
  communityController.getPostById,
);

communityRouter.delete(
  "/posts/:postId",
  protect,
  communityController.deletePost,
);

communityRouter.post(
  "/posts/:postId/comments",
  protect,
  communityController.createComment,
);

communityRouter.post(
  "/comments/:commentId/replies",
  protect,
  communityController.createReply,
);

communityRouter.get("/posts/:postId/comments", communityController.getComments);

communityRouter.delete(
  "/comments/:commentId",
  protect,
  communityController.deleteComment,
);

communityRouter.post(
  "/comments/:commentId/helpful",
  protect,
  communityController.markCommentHelpful,
);

communityRouter.post(
  "/comments/:commentId/solved",
  protect,
  communityController.markCommentSolved,
);

communityRouter.delete(
  "/comments/:commentId/helpful",
  protect,
  communityController.unmarkCommentHelpful,
);

communityRouter.delete(
  "/comments/:commentId/solved",
  protect,
  communityController.unmarkCommentSolved,
);

communityRouter.post(
  "/posts/:postId/like",
  protect,
  communityController.likePost,
);

communityRouter.delete(
  "/posts/:postId/like",
  protect,
  communityController.unlikePost,
);

communityRouter.get("/posts/:postId/likes", communityController.getPostLikes);

communityRouter.post(
  "/posts/:postId/save",
  protect,
  communityController.savePost,
);

communityRouter.delete(
  "/posts/:postId/save",
  protect,
  communityController.unsavePost,
);

communityRouter.get("/users/me/posts", protect, communityController.getMyPosts);

communityRouter.get(
  "/users/:userId",
  optionalAuth,
  communityController.getUserProfile,
);

communityRouter.get(
  "/users/:userId/posts",
  optionalAuth,
  communityController.getUserPosts,
);

communityRouter.post(
  "/users/:userId/follow",
  protect,
  communityController.followUser,
);

communityRouter.delete(
  "/users/:userId/follow",
  protect,
  communityController.unfollowUser,
);

communityRouter.post(
  "/tags/:tagId/follow",
  protect,
  communityController.followTag,
);

communityRouter.delete(
  "/tags/:tagId/follow",
  protect,
  communityController.unfollowTag,
);

communityRouter.get(
  "/users/:userId/followers",
  optionalAuth,
  communityController.getFollowers,
);

communityRouter.get(
  "/users/:userId/following",
  optionalAuth,
  communityController.getFollowing,
);

communityRouter.get(
  "/users/me/following/tags",
  protect,
  communityController.getMyFollowingTags,
);

export default communityRouter;
