export type Role = 'admin' | 'member'
export type TaskStatus = 'todo' | 'in_progress' | 'blocked' | 'done'
export type Priority = 'low' | 'medium' | 'high' | 'critical'
export type Period = 'week' | 'month' | 'all'
export type Tier = 'bronze' | 'silver' | 'gold'

export interface UserPublic {
  id: number
  username: string
  full_name: string
  title: string | null
  avatar_color: string
  role: Role
  is_active: boolean
}

export interface UserOut extends UserPublic {
  email: string | null
  created_at: string
}

export type ProjectStatus = 'active' | 'archived'

export interface ProjectRef {
  id: number
  name: string
  color: string
  status: ProjectStatus
}

export interface Update {
  id: number
  task_id: number
  user_id: number
  date: string
  note: string
  created_at: string
}

/** An update with its author and task, as shown in feeds. */
export interface UpdateEntry {
  id: number
  date: string
  note: string
  created_at: string
  user: UserPublic
  task: { id: number; title: string; status: TaskStatus; project: ProjectRef | null }
}

export interface Task {
  id: number
  owner_id: number
  owner: UserPublic
  project_id: number | null
  project: ProjectRef | null
  title: string
  description: string
  status: TaskStatus
  priority: Priority
  start_date: string | null
  due_date: string | null
  completed_at: string | null
  progress_pct: number
  pending_notes: string
  tags: string[]
  is_overdue: boolean
  last_update: Update | null
  created_at: string
  updated_at: string
}

export interface TaskDetail extends Task {
  updates: Update[]
}

export interface TaskInput {
  title: string
  description: string
  status: TaskStatus
  priority: Priority
  project_id: number | null
  start_date: string | null
  due_date: string | null
  progress_pct: number
  pending_notes: string
  tags: string[]
}

export interface ProjectMember {
  user: UserPublic
  open_tasks: number
  last_update: UpdateEntry | null
}

export interface ProjectSummary {
  id: number
  name: string
  description: string
  color: string
  status: ProjectStatus
  created_by: UserPublic
  created_at: string
  counts: Record<TaskStatus, number>
  total_tasks: number
  overdue: number
  last_activity: string | null
  members: ProjectMember[]
  recent_updates: UpdateEntry[]
}

export interface ProjectDetail extends ProjectSummary {
  tasks: Task[]
}

export interface ProjectInput {
  name: string
  description: string
  color: string
}

export interface AchievementDef {
  key: string
  name: string
  description: string
  icon: string
  points: number
  tier: Tier
  target: number
}

export interface AchievementStatus extends AchievementDef {
  unlocked: boolean
  awarded_at: string | null
  progress: number
}

export interface EarnedRow {
  user: UserPublic
  keys: string[]
}

export interface AwardedAchievement {
  user: UserPublic
  achievement: AchievementDef
  awarded_at: string
}

export interface ScoreBreakdown {
  tasks: number
  on_time: number
  updates: number
  streak: number
  achievements: number
}

export interface LeaderboardEntry {
  rank: number
  user: UserPublic
  score: number
  tasks_completed: number
  update_days: number
  streak: number
  achievements: number
  breakdown: ScoreBreakdown
}

export interface MemberSnapshot {
  user: UserPublic
  current_task: Task | null
  open_tasks: number
  blocked_tasks: number
  latest_update: UpdateEntry | null
  updated_today: boolean
}

export interface TeamOverview {
  status_counts: Record<TaskStatus, number>
  overdue: number
  completed_this_week: number
  people: number
  people_updated_today: number
  updates_today: number
  unmapped_open_tasks: number
  members: MemberSnapshot[]
  recent_achievements: AwardedAchievement[]
}

export interface MyStats {
  score: number
  rank: number
  streak: number
  update_days_this_week: number
  tasks_completed: number
  open_tasks: number
  unmapped_tasks: number
  updated_today: boolean
  breakdown: ScoreBreakdown
}

export type ActivityCategory = 'auth' | 'task' | 'update' | 'project' | 'user'

export interface ActivityEntry {
  id: number
  user: UserPublic | null
  action: string
  entity_type: 'task' | 'project' | 'update' | 'user' | null
  entity_id: number | null
  summary: string
  details: {
    changes?: Record<string, [unknown, unknown]>
    note?: string
    task_id?: number
    username?: string
    [key: string]: unknown
  }
  ip: string | null
  created_at: string
}

export interface ActivityPage {
  items: ActivityEntry[]
  next_before: number | null
}

export interface ActivityPerson {
  user: UserPublic
  actions_30d: number
  last_activity: string | null
  last_sign_in: string | null
  failed_sign_ins_30d: number
}
