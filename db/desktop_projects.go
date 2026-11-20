// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

package db

import (
	"context"
	"database/sql"
	"errors"
	"time"
)

var (
	ErrDesktopProjectNotFound = errors.New("project not found")
	ErrDesktopTaskNotFound    = errors.New("task not found")
	ErrDesktopTaskBound       = errors.New("task already belongs to another project")
)

type DesktopProject struct {
	ID        int64     `json:"id,string"`
	RootPath  string    `json:"root_path"`
	Name      string    `json:"name"`
	CreatedAt time.Time `json:"created_at"`
}

type DesktopProjectTask struct {
	ExplorationID int64  `json:"-"`
	ID            int64  `json:"id,string"`
	Name          string `json:"name"`
	Description   string `json:"description"`
	Goal          string `json:"goal"`
	Status        string `json:"status"`
	Paused        bool   `json:"paused"`
	Queued        bool   `json:"queued"`
	Pinned        bool   `json:"pinned"`
}

const desktopProjectTaskColumns = `t.exploration_id, t.id, t.name, t.description, t.goal, t.status, t.paused, t.queued, (t.pinned_at IS NOT NULL)`

func (d *DB) RegisterDesktopProject(ctx context.Context, root, name string) (DesktopProject, error) {
	var project DesktopProject
	err := d.QueryRowContext(ctx, `
INSERT INTO desktop_projects(root_path, name) VALUES ($1, $2)
ON CONFLICT (root_path) DO UPDATE SET root_path=EXCLUDED.root_path
RETURNING id, root_path, name, created_at`, root, name).
		Scan(&project.ID, &project.RootPath, &project.Name, &project.CreatedAt)
	return project, err
}

func (d *DB) ListDesktopProjects(ctx context.Context) ([]DesktopProject, error) {
	rows, err := d.QueryContext(ctx, `SELECT id, root_path, name, created_at FROM desktop_projects ORDER BY id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	projects := []DesktopProject{}
	for rows.Next() {
		var project DesktopProject
		if err := rows.Scan(&project.ID, &project.RootPath, &project.Name, &project.CreatedAt); err != nil {
			return nil, err
		}
		projects = append(projects, project)
	}
	return projects, rows.Err()
}

func (d *DB) DesktopTaskProject(ctx context.Context, taskID int64) (*int64, error) {
	var projectID *int64
	err := d.QueryRowContext(ctx, `
SELECT link.project_id FROM tasks t LEFT JOIN desktop_project_tasks link ON link.task_id=t.id
WHERE t.id=$1 AND t.deleted_at IS NULL`, taskID).Scan(&projectID)
	if errors.Is(err, sql.ErrNoRows) {
		err = ErrDesktopTaskNotFound
	}
	return projectID, err
}

// BindDesktopProjectTask is idempotent for the same project. A different project
// may only be assigned by a future explicit move operation.
func (d *DB) BindDesktopProjectTask(ctx context.Context, projectID, taskID int64) error {
	tx, err := d.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	var id int64
	err = tx.QueryRowContext(ctx, `SELECT id FROM desktop_projects WHERE id=$1 FOR KEY SHARE`, projectID).Scan(&id)
	if errors.Is(err, sql.ErrNoRows) {
		return ErrDesktopProjectNotFound
	}
	if err != nil {
		return err
	}
	err = tx.QueryRowContext(ctx, `SELECT id FROM tasks WHERE id=$1 AND deleted_at IS NULL FOR UPDATE`, taskID).Scan(&id)
	if errors.Is(err, sql.ErrNoRows) {
		return ErrDesktopTaskNotFound
	}
	if err != nil {
		return err
	}
	err = tx.QueryRowContext(ctx, `
INSERT INTO desktop_project_tasks(task_id, project_id) VALUES ($1, $2)
ON CONFLICT (task_id) DO UPDATE SET project_id=EXCLUDED.project_id
WHERE desktop_project_tasks.project_id=EXCLUDED.project_id
RETURNING project_id`, taskID, projectID).Scan(&id)
	if errors.Is(err, sql.ErrNoRows) {
		return ErrDesktopTaskBound
	}
	if err != nil {
		return err
	}
	return tx.Commit()
}

func scanDesktopProjectTask(row interface{ Scan(...any) error }) (DesktopProjectTask, error) {
	var task DesktopProjectTask
	err := row.Scan(&task.ExplorationID, &task.ID, &task.Name, &task.Description, &task.Goal, &task.Status, &task.Paused, &task.Queued, &task.Pinned)
	return task, err
}

func (d *DB) ListDesktopProjectTasks(ctx context.Context, projectID, before int64, limit int) ([]DesktopProjectTask, error) {
	var exists bool
	if err := d.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM desktop_projects WHERE id=$1)`, projectID).Scan(&exists); err != nil {
		return nil, err
	}
	if !exists {
		return nil, ErrDesktopProjectNotFound
	}
	rows, err := d.QueryContext(ctx, `SELECT `+desktopProjectTaskColumns+`
FROM desktop_project_tasks link JOIN tasks t ON t.id=link.task_id
WHERE link.project_id=$1 AND t.deleted_at IS NULL AND ($2=0 OR link.task_id<$2)
ORDER BY link.task_id DESC LIMIT $3`, projectID, before, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	tasks := []DesktopProjectTask{}
	for rows.Next() {
		task, err := scanDesktopProjectTask(rows)
		if err != nil {
			return nil, err
		}
		tasks = append(tasks, task)
	}
	return tasks, rows.Err()
}

func (d *DB) GetDesktopProjectTask(ctx context.Context, projectID, taskID int64) (DesktopProjectTask, error) {
	task, err := scanDesktopProjectTask(d.QueryRowContext(ctx, `SELECT `+desktopProjectTaskColumns+`
FROM desktop_project_tasks link JOIN tasks t ON t.id=link.task_id
WHERE link.project_id=$1 AND link.task_id=$2 AND t.deleted_at IS NULL`, projectID, taskID))
	if errors.Is(err, sql.ErrNoRows) {
		err = ErrDesktopTaskNotFound
	}
	return task, err
}
