import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Task } from '../src/api/types'
import { TaskForm, toFormValues, TASK_FORM_ID } from '../src/components/TaskForm'

function renderForm(task?: Task) {
  const onSubmit = vi.fn()
  render(
    <>
      <TaskForm task={task} onSubmit={onSubmit} />
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

  it('submits clean values: trimmed text, parsed tags and numbers, empty dates as null', async () => {
    const onSubmit = renderForm()
    await userEvent.type(screen.getByLabelText('What are you working on?'), '  Migrate invoices  ')
    await userEvent.selectOptions(screen.getByLabelText('Priority'), 'critical')
    await userEvent.type(screen.getByLabelText(/Estimate/), '12.5')
    await userEvent.type(screen.getByLabelText(/What's pending/), 'Waiting on the sandbox')
    await userEvent.type(screen.getByLabelText(/Tags/), 'billing, #backend, ,')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit.mock.calls[0][0]).toEqual({
      title: 'Migrate invoices',
      description: '',
      status: 'todo',
      priority: 'critical',
      start_date: null,
      due_date: null,
      estimated_hours: 12.5,
      progress_pct: 0,
      pending_notes: 'Waiting on the sandbox',
      tags: ['billing', 'backend'],
    })
  })

  it('prefills from an existing task', () => {
    const v = toFormValues({
      title: 'Kanban drag and drop',
      tags: ['frontend', 'ux'],
      estimated_hours: 14,
      due_date: '2026-11-02',
      status: 'in_progress',
    } as Task)
    expect(v.tags).toBe('frontend, ux')
    expect(v.estimated_hours).toBe('14')
    expect(v.due_date).toBe('2026-11-02')
    expect(v.start_date).toBe('')
  })
})
