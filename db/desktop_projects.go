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

// ErrDesktopProjectNotFound is returned when a project id does not exist.
var ErrDesktopProjectNotFound = errors.New("desktop project not found")

// DesktopProject is one registered working directory. It is the ownership unit
// for conversations: the id is allocated here, never derived by a client from
// the path it happens to have open.
type DesktopProject struct {
	ID        int64     `json:"id,string"`
	RootPath  string    `json:"root_path"`
	Name      string    `json:"name"`
	CreatedAt time.Time `json:"created_at"`
}

// RegisterDesktopProject resolves an existing project by root path, creating it
// on first sight. Re-registering the same path is idempotent and keeps the
// original name so a directory rename does not silently split history.
func (d *DB) RegisterDesktopProject(ctx context.Context, root, name string) (DesktopProject, error) {
	var project DesktopProject
	err := d.QueryRowContext(ctx, `
INSERT INTO desktop_projects(root_path, name) VALUES ($1, $2)
ON CONFLICT (root_path) DO UPDATE SET root_path = EXCLUDED.root_path
RETURNING id, root_path, name, created_at`, root, name).
		Scan(&project.ID, &project.RootPath, &project.Name, &project.CreatedAt)
	return project, err
}

// ListDesktopProjects returns every registered project, oldest first.
func (d *DB) ListDesktopProjects(ctx context.Context) ([]DesktopProject, error) {
	rows, err := d.QueryContext(ctx, `
SELECT id, root_path, name, created_at FROM desktop_projects ORDER BY created_at, id`)
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

// DesktopProjectByRoot looks up a registered project by its canonical root path.
// A missing row is not an error: callers use nil to mean "not registered yet".
func (d *DB) DesktopProjectByRoot(ctx context.Context, root string) (*DesktopProject, error) {
	var project DesktopProject
	err := d.QueryRowContext(ctx, `
SELECT id, root_path, name, created_at FROM desktop_projects WHERE root_path = $1`, root).
		Scan(&project.ID, &project.RootPath, &project.Name, &project.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &project, nil
}

// DesktopProjectByID returns one project or ErrDesktopProjectNotFound.
func (d *DB) DesktopProjectByID(ctx context.Context, id int64) (DesktopProject, error) {
	var project DesktopProject
	err := d.QueryRowContext(ctx, `
SELECT id, root_path, name, created_at FROM desktop_projects WHERE id = $1`, id).
		Scan(&project.ID, &project.RootPath, &project.Name, &project.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return DesktopProject{}, ErrDesktopProjectNotFound
	}
	return project, err
}
