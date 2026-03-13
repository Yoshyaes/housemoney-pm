-- Enable pg_trgm extension for trigram-based fuzzy search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- GIN trigram indexes for fast similarity search
CREATE INDEX idx_task_title_trgm ON "Task" USING GIN (title gin_trgm_ops);
CREATE INDEX idx_task_identifier_trgm ON "Task" USING GIN (identifier gin_trgm_ops);
CREATE INDEX idx_task_description_trgm ON "Task" USING GIN (COALESCE(description, '') gin_trgm_ops);
CREATE INDEX idx_comment_body_trgm ON "Comment" USING GIN (body gin_trgm_ops);
CREATE INDEX idx_project_name_trgm ON "Project" USING GIN (name gin_trgm_ops);
CREATE INDEX idx_project_description_trgm ON "Project" USING GIN (COALESCE(description, '') gin_trgm_ops);
