// ============================================================
// AdminUsersPage — User management table (live API)
// ============================================================
import { useState, useEffect } from 'react'
import { Users, Edit2, CheckCircle, XCircle, Loader2 } from 'lucide-react'
import { adminService } from '@/services/adminService'
import type { User } from '@/types'
import type { UserRole } from '@/types/constants'

const ROLE_BADGE: Record<UserRole, string> = {
  super_admin: 'text-verdict-fake border-red-400/30 bg-red-400/10',
  supervisor: 'text-status-pending border-amber-400/30 bg-amber-400/10',
  investigator: 'text-status-review border-blue-400/30 bg-blue-400/10',
  citizen: 'text-text-muted border-surface-border',
  api_partner: 'text-status-referred border-purple-400/30 bg-purple-400/10',
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [editRole, setEditRole] = useState<UserRole>('investigator')
  const [editActive, setEditActive] = useState<boolean>(true)
  const [saving, setSaving] = useState(false)

  const loadUsers = async () => {
    try {
      const res = await adminService.getUsers()
      setUsers(res.items)
    } catch (err) {
      console.error('Failed to load users:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadUsers()
  }, [])

  const startEdit = (user: User) => {
    setEditingUser(user)
    setEditRole(user.role as UserRole)
    setEditActive(user.is_active)
  }

  const handleSave = async () => {
    if (!editingUser) return
    setSaving(true)
    try {
      await adminService.updateUser(editingUser.id, {
        role: editRole,
        is_active: editActive,
      })
      await loadUsers()
      setEditingUser(null)
    } catch (err) {
      console.error('Failed to update user:', err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-5 animate-slide-up">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-h2 font-bold text-text-primary">User Management</h1>
          <p className="text-body-sm text-text-muted mt-1">
            {loading ? 'Loading users...' : `${users.length} users registered`}
          </p>
        </div>
      </div>

      <div className="card-base overflow-hidden">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-text-muted">
            <Loader2 className="w-8 h-8 animate-spin text-accent-primary" />
            <p className="text-body-sm">Loading user directory...</p>
          </div>
        ) : users.length === 0 ? (
          <div className="text-center py-16 text-text-muted">
            <Users className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p className="text-body-sm">No users found.</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="table-header">
                <th className="text-left px-4 py-3">User</th>
                <th className="text-left px-4 py-3 hidden sm:table-cell">Role</th>
                <th className="text-left px-4 py-3 hidden md:table-cell">Organization</th>
                <th className="text-left px-4 py-3 hidden lg:table-cell">Joined</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-right px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map(user => (
                <tr key={user.id} className="table-row">
                  <td className="px-4 py-3">
                    <p className="text-body-sm font-medium text-text-primary">{user.name}</p>
                    <p className="text-caption text-text-muted font-mono-data">{user.email}</p>
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell">
                    <span className={`badge-base border ${ROLE_BADGE[user.role as UserRole] ?? 'border-surface-border'}`}>
                      {user.role.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <span className="text-body-sm text-text-secondary">{user.organization ?? '—'}</span>
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    <span className="text-caption text-text-muted">{new Date(user.created_at).toLocaleDateString()}</span>
                  </td>
                  <td className="px-4 py-3">
                    {user.is_active
                      ? <span className="flex items-center gap-1.5 text-caption text-accent-primary"><CheckCircle className="w-3.5 h-3.5" /> Active</span>
                      : <span className="flex items-center gap-1.5 text-caption text-verdict-fake"><XCircle className="w-3.5 h-3.5" /> Inactive</span>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      id={`admin-users-edit-${user.id}`}
                      onClick={() => startEdit(user)}
                      className="btn-ghost p-1.5"
                      aria-label="Edit user"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Edit modal */}
      {editingUser && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setEditingUser(null)}>
          <div className="card-base p-6 w-full max-w-md shadow-modal" onClick={e => e.stopPropagation()}>
            <h2 className="text-h4 font-bold text-text-primary mb-1">Edit User Permissions</h2>
            <p className="text-body-sm text-text-muted mb-4">{editingUser.name} ({editingUser.email})</p>
            <div className="space-y-4">
              <div>
                <label className="block text-body-sm font-medium text-text-secondary mb-1">Role</label>
                <select
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value as UserRole)}
                  className="input-base"
                >
                  {(['investigator', 'supervisor', 'super_admin', 'citizen', 'api_partner'] as UserRole[]).map(r => (
                    <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="user-active-checkbox"
                  checked={editActive}
                  onChange={(e) => setEditActive(e.target.checked)}
                  className="w-4 h-4 accent-emerald-500 rounded"
                />
                <label htmlFor="user-active-checkbox" className="text-body-sm font-medium text-text-secondary cursor-pointer">
                  Account Active & Enabled
                </label>
              </div>
            </div>
            <div className="flex gap-3 justify-end mt-6">
              <button onClick={() => setEditingUser(null)} className="btn-ghost">Cancel</button>
              <button
                id="admin-users-save"
                disabled={saving}
                onClick={handleSave}
                className="btn-primary"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
