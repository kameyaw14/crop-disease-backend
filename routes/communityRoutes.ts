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
  "/posts/:postId",
  optionalAuth,
  communityController.getPostById,
);

communityRouter.get("/users/me/posts", protect, communityController.getMyPosts);

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
export default communityRouter;
