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

export interface WorkLog {
  id: number
  task_id: number
  user_id: number
  date: string
  hours: number
  note: string
  created_at: string
}

export interface Task {
  id: number
  owner_id: number
  owner: UserPublic
  title: string
  description: string
  status: TaskStatus
  priority: Priority
  start_date: string | null
  due_date: string | null
  completed_at: string | null
  estimated_hours: number | null
  progress_pct: number
  pending_notes: string
  tags: string[]
  hours_logged: number
  is_overdue: boolean
  created_at: string
  updated_at: string
}

export interface TaskDetail extends Task {
  logs: WorkLog[]
}

export interface TaskInput {
  title: string
  description: string
  status: TaskStatus
  priority: Priority
  start_date: string | null
  due_date: string | null
  estimated_hours: number | null
  progress_pct: number
  pending_notes: string
  tags: string[]
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
  hours: number
  streak: number
  achievements: number
}

export interface LeaderboardEntry {
  rank: number
  user: UserPublic
  score: number
  tasks_completed: number
  hours: number
  streak: number
  achievements: number
  breakdown: ScoreBreakdown
}

export interface MemberSnapshot {
  user: UserPublic
  current_task: Task | null
  open_tasks: number
  blocked_tasks: number
  hours_this_week: number
}

export interface TeamOverview {
  status_counts: Record<TaskStatus, number>
  overdue: number
  hours_this_week: number
  hours_last_week: number
  completed_this_week: number
  daily_hours: { date: string; hours: number }[]
  members: MemberSnapshot[]
  recent_achievements: AwardedAchievement[]
}

export interface MyStats {
  score: number
  rank: number
  streak: number
  hours_this_week: number
  tasks_completed: number
  open_tasks: number
  breakdown: ScoreBreakdown
}
