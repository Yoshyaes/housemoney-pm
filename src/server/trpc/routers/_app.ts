import { router } from '@/server/trpc/trpc';
import { tasksRouter } from './tasks';
import { projectsRouter } from './projects';
import { commentsRouter } from './comments';
import { dependenciesRouter } from './dependencies';
import { viewsRouter } from './views';
import { notificationsRouter } from './notifications';
import { workspaceRouter } from './workspace';
import { searchRouter } from './search';
import { aiRouter } from './ai';
import { analyticsRouter } from './analytics';
import { sectionsRouter } from './sections';
import { documentsRouter } from './documents';
import { docCommentsRouter } from './doc-comments';

export const appRouter = router({
  tasks: tasksRouter,
  projects: projectsRouter,
  comments: commentsRouter,
  dependencies: dependenciesRouter,
  views: viewsRouter,
  notifications: notificationsRouter,
  workspace: workspaceRouter,
  search: searchRouter,
  ai: aiRouter,
  analytics: analyticsRouter,
  sections: sectionsRouter,
  documents: documentsRouter,
  docComments: docCommentsRouter,
});

export type AppRouter = typeof appRouter;
