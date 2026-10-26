import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './client'
import type {
  AchievementDef,
  AchievementStatus,
  EarnedRow,
  LeaderboardEntry,
  MyStats,
  Period,
  ProjectDetail,
  ProjectInput,
  ProjectStatus,
  ProjectSummary,
  Role,
  Task,
  TaskDetail,
  TaskInput,
  TaskStatus,
  TeamOverview,
  UserOut,
  Update,
  UpdateEntry,
  UserPublic,
} from './types'

export interface TaskFilters {
  owner_id?: number
  project_id?: number
  unmapped?: boolean
  status?: TaskStatus[]
  q?: string
}

export interface UpdateFilters {
  on?: string
  from?: string
  to?: string
  user_id?: number
  project_id?: number
  limit?: number
}

const get = <T,>(url: string, params?: object) => api.get<T>(url, { params }).then((r) => r.data)

export const keys = {
  tasks: (f?: TaskFilters) => ['tasks', f ?? {}] as const,
  task: (id: number) => ['task', id] as const,
  members: ['members'] as const,
  adminUsers: ['admin-users'] as const,
  leaderboard: (p: Period) => ['leaderboard', p] as const,
  overview: ['overview'] as const,
  me: ['stats-me'] as const,
  achievements: (userId: number) => ['achievements', userId] as const,
  projects: (state: ProjectStatus | 'all') => ['projects', state] as const,
  project: (id: number) => ['project', id] as const,
  updates: (f: UpdateFilters) => ['updates', f] as const,
}

export function useTasks(filters: TaskFilters = {}) {
  return useQuery({
    queryKey: keys.tasks(filters),
    queryFn: () =>
      get<Task[]>('/tasks', {
        owner_id: filters.owner_id,
        project_id: filters.project_id,
        unmapped: filters.unmapped || undefined,
        q: filters.q || undefined,
        status: filters.status,
      }),
  })
}

export function useTask(id: number | null) {
  return useQuery({
    queryKey: keys.task(id ?? 0),
    queryFn: () => get<TaskDetail>(`/tasks/${id}`),
    enabled: id != null,
  })
}

export const useMembers = () => useQuery({ queryKey: keys.members, queryFn: () => get<UserPublic[]>('/users') })
export const useAdminUsers = () => useQuery({ queryKey: keys.adminUsers, queryFn: () => get<UserOut[]>('/admin/users') })
export const useLeaderboard = (period: Period) =>
  useQuery({ queryKey: keys.leaderboard(period), queryFn: () => get<LeaderboardEntry[]>('/leaderboard', { period }) })
export const useOverview = () => useQuery({ queryKey: keys.overview, queryFn: () => get<TeamOverview>('/stats/overview') })
export const useMyStats = () => useQuery({ queryKey: keys.me, queryFn: () => get<MyStats>('/stats/me') })
export const useAchievements = (userId: number | undefined) =>
  useQuery({
    queryKey: keys.achievements(userId ?? 0),
    queryFn: () => get<AchievementStatus[]>(`/users/${userId}/achievements`),
    enabled: userId != null,
  })

export const useProjects = (state: ProjectStatus | 'all' = 'active') =>
  useQuery({ queryKey: keys.projects(state), queryFn: () => get<ProjectSummary[]>('/projects', { state }) })
export const useProject = (id: number) =>
  useQuery({ queryKey: keys.project(id), queryFn: () => get<ProjectDetail>(`/projects/${id}`) })
export const useUpdates = (filters: UpdateFilters, enabled = true) =>
  useQuery({ queryKey: keys.updates(filters), queryFn: () => get<UpdateEntry[]>('/updates', filters), enabled })

export const useAchievementCatalog = () =>
  useQuery({ queryKey: ['achievements', 'catalog'], queryFn: () => get<AchievementDef[]>('/achievements'), staleTime: Infinity })
export const useEarnedMatrix = () =>
  useQuery({ queryKey: ['achievements', 'earned'], queryFn: () => get<EarnedRow[]>('/achievements/earned') })

/** Anything that changes work changes scores, the overview and achievements too. */
function useInvalidateWork() {
  const qc = useQueryClient()
  return () =>
    Promise.all(
      ['tasks', 'task', 'leaderboard', 'overview', 'stats-me', 'achievements', 'projects', 'project', 'updates'].map((k) =>
        qc.invalidateQueries({ queryKey: [k] }),
      ),
    )
}

export function useCreateTask() {
  const invalidate = useInvalidateWork()
  return useMutation({
    mutationFn: (body: TaskInput) => api.post<Task>('/tasks', body).then((r) => r.data),
    onSuccess: invalidate,
  })
}

export function useUpdateTask() {
  const invalidate = useInvalidateWork()
  return useMutation({
    mutationFn: ({ id, ...body }: Partial<TaskInput> & { id: number }) =>
      api.patch<Task>(`/tasks/${id}`, body).then((r) => r.data),
    onSuccess: invalidate,
  })
}

export function useDeleteTask() {
  const invalidate = useInvalidateWork()
  return useMutation({ mutationFn: (id: number) => api.delete(`/tasks/${id}`), onSuccess: invalidate })
}

export function useAddUpdate() {
  const invalidate = useInvalidateWork()
  return useMutation({
    mutationFn: ({ taskId, ...body }: { taskId: number; date: string; note: string }) =>
      api.post<Update>(`/tasks/${taskId}/updates`, body).then((r) => r.data),
    onSuccess: invalidate,
  })
}

export function useDeleteUpdate() {
  const invalidate = useInvalidateWork()
  return useMutation({
    mutationFn: ({ taskId, updateId }: { taskId: number; updateId: number }) =>
      api.delete(`/tasks/${taskId}/updates/${updateId}`),
    onSuccess: invalidate,
  })
}

export function useCreateProject() {
  const invalidate = useInvalidateWork()
  return useMutation({
    mutationFn: (body: ProjectInput) => api.post<ProjectSummary>('/projects', body).then((r) => r.data),
    onSuccess: invalidate,
  })
}

export function useUpdateProject() {
  const invalidate = useInvalidateWork()
  return useMutation({
    mutationFn: ({ id, ...body }: Partial<ProjectInput> & { status?: ProjectStatus; id: number }) =>
      api.patch<ProjectSummary>(`/projects/${id}`, body).then((r) => r.data),
    onSuccess: invalidate,
  })
}

export function useDeleteProject() {
  const invalidate = useInvalidateWork()
  return useMutation({ mutationFn: (id: number) => api.delete(`/projects/${id}`), onSuccess: invalidate })
}

export interface NewUser {
  username: string
  full_name: string
  email: string | null
  title: string | null
  password: string
  role: Role
}

function useInvalidateUsers() {
  const qc = useQueryClient()
  return () =>
    Promise.all(
      ['admin-users', 'members', 'leaderboard', 'overview', 'tasks'].map((k) => qc.invalidateQueries({ queryKey: [k] })),
    )
}

export function useCreateUser() {
  const invalidate = useInvalidateUsers()
  return useMutation({
    mutationFn: (body: NewUser) => api.post<UserOut>('/admin/users', body).then((r) => r.data),
    onSuccess: invalidate,
  })
}

export function useUpdateUser() {
  const invalidate = useInvalidateUsers()
  return useMutation({
    mutationFn: ({ id, ...body }: { id: number } & Partial<Omit<UserOut, 'id'>>) =>
      api.patch<UserOut>(`/admin/users/${id}`, body).then((r) => r.data),
    onSuccess: invalidate,
  })
}

export function useResetPassword() {
  return useMutation({
    mutationFn: ({ id, new_password }: { id: number; new_password: string }) =>
      api.post(`/admin/users/${id}/reset-password`, { new_password }),
  })
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (body: { current_password: string; new_password: string }) => api.post('/auth/change-password', body),
  })
}
