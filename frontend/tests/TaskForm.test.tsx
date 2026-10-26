import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ProjectRef, Task } from '../src/api/types'
import { TaskForm, toFormValues, TASK_FORM_ID } from '../src/components/TaskForm'

const PROJECTS: ProjectRef[] = [
  { id: 1, name: 'Billing v2', color: '#2563eb', status: 'active' },
  { id: 2, name: 'Hiring', color: '#be123c', status: 'active' },
]

function renderForm(props: { task?: Task; defaultProjectId?: number } = {}) {
  const onSubmit = vi.fn()
  render(
    <>
      <TaskForm projects={PROJECTS} onSubmit={onSubmit} {...props} />
      <button type="submit" form={TASK_FORM_ID}>
        Save
      </button>
    </>,
  )
  return onSubmit
}

describe('TaskForm', () => {
  it('requires a title', async () => {
    const onSubmit = renderForm()
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Give the task a title')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('rejects a due date before the start date', async () => {
    const onSubmit = renderForm()
    await userEvent.type(screen.getByLabelText('What are you working on?'), 'Ship it')
    fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2026-10-20' } })
    fireEvent.change(screen.getByLabelText('Due date'), { target: { value: '2026-10-18' } })
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Due date is before the start date')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('submits clean values: trimmed text, chosen project, parsed tags, empty dates as null', async () => {
    const onSubmit = renderForm()
    await userEvent.type(screen.getByLabelText('What are you working on?'), '  Migrate invoices  ')
    await userEvent.selectOptions(screen.getByLabelText('Project'), 'Billing v2')
    await userEvent.selectOptions(screen.getByLabelText('Priority'), 'critical')
    await userEvent.type(screen.getByLabelText(/What's pending/), 'Waiting on the sandbox')
    await userEvent.type(screen.getByLabelText(/Tags/), 'billing, #backend, ,')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit.mock.calls[0][0]).toEqual({
      title: 'Migrate invoices',
      description: '',
      status: 'todo',
      priority: 'critical',
      project_id: 1,
      start_date: null,
      due_date: null,
      progress_pct: 0,
      pending_notes: 'Waiting on the sandbox',
      tags: ['billing', 'backend'],
    })
  })

  it('starts in the given project and can be left without one', async () => {
    const onSubmit = renderForm({ defaultProjectId: 2 })
    expect(screen.getByLabelText('Project')).toHaveValue('2')
    await userEvent.selectOptions(screen.getByLabelText('Project'), 'No project')
    await userEvent.type(screen.getByLabelText('What are you working on?'), 'Loose end')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit.mock.calls[0][0].project_id).toBeNull()
  })

  it('prefills from an existing task', () => {
    const v = toFormValues({
      title: 'Kanban drag and drop',
      tags: ['frontend', 'ux'],
      project_id: 1,
      due_date: '2026-11-02',
      status: 'in_progress',
    } as Task)
    expect(v.tags).toBe('frontend, ux')
    expect(v.project_id).toBe('1')
    expect(v.due_date).toBe('2026-11-02')
    expect(v.start_date).toBe('')
  })
})
