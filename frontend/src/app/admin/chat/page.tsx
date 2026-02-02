/**
 * Chat interno – conversas entre funcionários, professores e alunos.
 */

'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import AdminLayout from '@/components/admin/AdminLayout'
import Modal from '@/components/admin/Modal'
import Button from '@/components/ui/Button'
import { MessageCircle, Plus, Send, Users } from 'lucide-react'

interface ChatUser {
  id: string
  nome: string
  email: string
  role: string
  roleLabel: string
}

interface Conversation {
  id: string
  type: string
  name: string | null
  criadoEm: string
  participants: ChatUser[]
  lastMessage: { id: string; content: string; criadoEm: string; senderId: string } | null
  unreadCount?: number
  lastReadAt?: string | null
  isParticipant?: boolean
}

interface ChatMessage {
  id: string
  senderId: string
  senderNome: string
  senderRole: string
  senderRoleLabel: string
  content: string
  criadoEm: string
  isOwn: boolean
}

function formatChatTime(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const isToday = d.toDateString() === now.toDateString()
  if (isToday) return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function formatReadStatus(conv: Conversation): string {
  if ((conv.unreadCount ?? 0) > 0) return 'Não lida'
  if (conv.lastReadAt) {
    const d = new Date(conv.lastReadAt)
    return 'Lida em ' + d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' às ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  }
  return ''
}

/** Admin sempre vê nome inteiro (usuários do ADM podem ver o nome completo). */
function conversationTitle(conv: Conversation): string {
  if (conv.type === 'GROUP' && conv.name) return conv.name
  if (conv.participants.length === 1) return conv.participants[0].nome + ' (' + conv.participants[0].roleLabel + ')'
  return conv.participants.map((p) => p.nome).join(', ')
}

export default function AdminChatPage() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [inputText, setInputText] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [modalNewChat, setModalNewChat] = useState(false)
  const [chatUsers, setChatUsers] = useState<ChatUser[]>([])
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([])
  const [newChatType, setNewChatType] = useState<'DIRECT' | 'GROUP'>('DIRECT')
  const [newGroupName, setNewGroupName] = useState('')
  const [creating, setCreating] = useState(false)
  const [viewAllConversations, setViewAllConversations] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const fetchConversations = useCallback(async () => {
    try {
      const url = viewAllConversations
        ? '/api/admin/chat/conversations?all=true'
        : '/api/admin/chat/conversations'
      const res = await fetch(url, { credentials: 'include' })
      const json = await res.json()
      if (res.ok && json.ok) setConversations(json.data.conversations ?? [])
    } catch {
      setConversations([])
    }
  }, [viewAllConversations])

  const fetchMessages = useCallback(async (convId: string, before?: string) => {
    try {
      const url = before
        ? `/api/admin/chat/conversations/${convId}/messages?limit=50&before=${before}`
        : `/api/admin/chat/conversations/${convId}/messages?limit=50`
      const res = await fetch(url, { credentials: 'include' })
      const json = await res.json()
      if (!res.ok || !json.ok) return []
      return json.data.messages ?? []
    } catch {
      return []
    }
  }, [])

  useEffect(() => {
    setLoading(true)
    fetchConversations().finally(() => setLoading(false))
  }, [fetchConversations])

  const selectedConv = conversations.find((c) => c.id === selectedId)
  const isParticipantInSelected = selectedConv?.isParticipant !== false

  const markAsRead = useCallback(async (convId: string) => {
    try {
      await fetch(`/api/admin/chat/conversations/${convId}/messages`, {
        method: 'PATCH',
        credentials: 'include',
      })
      await fetchConversations()
      window.dispatchEvent(new CustomEvent('admin-chat-updated'))
    } catch {
      // ignore
    }
  }, [fetchConversations])

  useEffect(() => {
    if (!selectedId) {
      setMessages([])
      return
    }
    markAsRead(selectedId)
    fetchMessages(selectedId).then(setMessages)
    const interval = setInterval(() => {
      fetchMessages(selectedId).then(setMessages)
    }, 4000)
    return () => clearInterval(interval)
  }, [selectedId, fetchMessages, markAsRead])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMessage = async () => {
    const text = inputText.trim()
    if (!text || !selectedId || sending) return
    setSending(true)
    setInputText('')
    try {
      const res = await fetch(`/api/admin/chat/conversations/${selectedId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ content: text }),
      })
      const json = await res.json()
      if (res.ok && json.ok && json.data.message) {
        setMessages((prev) => [...prev, json.data.message])
      }
      await fetchConversations()
      window.dispatchEvent(new CustomEvent('admin-chat-updated'))
    } finally {
      setSending(false)
    }
  }

  const openNewChatModal = async () => {
    setModalNewChat(true)
    setSelectedUserIds([])
    setNewChatType('DIRECT')
    setNewGroupName('')
    try {
      const res = await fetch('/api/admin/chat/users', { credentials: 'include' })
      const json = await res.json()
      if (res.ok && json.ok) setChatUsers(json.data ?? [])
      else setChatUsers([])
    } catch {
      setChatUsers([])
    }
  }

  const createConversation = async () => {
    if (newChatType === 'DIRECT' && selectedUserIds.length !== 1) return
    if (newChatType === 'GROUP' && selectedUserIds.length < 1) return
    setCreating(true)
    try {
      const res = await fetch('/api/admin/chat/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          type: newChatType,
          participantIds: selectedUserIds,
          name: newChatType === 'GROUP' ? (newGroupName.trim() || undefined) : undefined,
        }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) {
        alert(json.message || 'Erro ao criar conversa')
        return
      }
      const conv = json.data.conversation
      setConversations((prev) => [conv, ...prev])
      setSelectedId(conv.id)
      setModalNewChat(false)
    } finally {
      setCreating(false)
    }
  }

  const toggleUser = (id: string) => {
    setSelectedUserIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : newChatType === 'DIRECT' ? [id] : [...prev, id]
    )
  }

  return (
    <AdminLayout>
      <div className="flex flex-col h-[calc(100vh-5rem)]">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-gray-900">Chat</h1>
          <Button variant="primary" onClick={openNewChatModal} className="inline-flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Nova conversa
          </Button>
        </div>
        <p className="text-sm text-gray-600 mb-4">
          Conversas internas entre funcionários, professores e alunos. Inicie uma conversa direta ou crie um grupo.
        </p>

        <div className="flex-1 flex min-h-0 rounded-xl border border-gray-200 bg-white overflow-hidden">
          <div className="w-80 border-r border-gray-200 flex flex-col">
            <label className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 cursor-pointer hover:bg-gray-50">
              <input
                type="checkbox"
                checked={viewAllConversations}
                onChange={(e) => setViewAllConversations(e.target.checked)}
                className="rounded border-gray-300 text-brand-orange"
              />
              <span className="text-sm font-medium text-gray-700">Ver todas as conversas</span>
            </label>
            {loading ? (
              <div className="p-4 text-gray-500">Carregando...</div>
            ) : conversations.length === 0 ? (
              <div className="p-4 text-gray-500 text-sm">Nenhuma conversa. Clique em &quot;Nova conversa&quot; para começar.</div>
            ) : (
              <ul className="overflow-y-auto flex-1">
                {conversations.map((conv) => (
                  <li key={conv.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(conv.id)}
                      className={`w-full text-left px-4 py-3 border-b border-gray-100 hover:bg-gray-50 flex flex-col gap-0.5 relative ${
                        selectedId === conv.id ? 'bg-orange-50 border-l-4 border-l-orange-500' : ''
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <span className="font-medium text-gray-900 truncate">{conversationTitle(conv)}</span>
                        {(conv.unreadCount ?? 0) > 0 && (
                          <span className="shrink-0 w-2 h-2 rounded-full bg-red-500" title={`${conv.unreadCount} não lida(s)`} aria-label={`${conv.unreadCount} não lidas`} />
                        )}
                      </span>
                      {conv.lastMessage && (
                        <span className="text-xs text-gray-500 truncate">{conv.lastMessage.content}</span>
                      )}
                      {formatReadStatus(conv) && (
                        <span className="text-xs text-gray-400">{formatReadStatus(conv)}</span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex-1 flex flex-col min-w-0">
            {!selectedConv ? (
              <div className="flex-1 flex items-center justify-center text-gray-500">
                <div className="text-center">
                  <MessageCircle className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                  <p>Selecione uma conversa ou inicie uma nova.</p>
                </div>
              </div>
            ) : (
              <>
                <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <Users className="w-5 h-5 text-gray-500 shrink-0" />
                    <span className="font-medium text-gray-900">{conversationTitle(selectedConv)}</span>
                  </div>
                  {!isParticipantInSelected && (
                    <p className="text-xs text-amber-700 bg-amber-50 px-2 py-1 rounded">Visualização somente (você não participa desta conversa)</p>
                  )}
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex ${msg.isOwn ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[75%] rounded-lg px-3 py-2 ${
                          msg.isOwn
                            ? 'bg-orange-600 text-white'
                            : 'bg-gray-100 text-gray-900'
                        }`}
                      >
                        {!msg.isOwn && (
                          <p className="text-xs font-medium text-gray-600 mb-0.5">
                            {msg.senderNome} · {msg.senderRoleLabel}
                          </p>
                        )}
                        <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
                        <p className={`text-xs mt-1 ${msg.isOwn ? 'text-orange-200' : 'text-gray-500'}`}>
                          {formatChatTime(msg.criadoEm)}
                        </p>
                      </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>
                {isParticipantInSelected && (
                  <div className="p-4 border-t border-gray-200 flex gap-2">
                    <input
                      type="text"
                      value={inputText}
                      onChange={(e) => setInputText(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                      placeholder="Digite sua mensagem..."
                      className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                    />
                    <Button variant="primary" onClick={sendMessage} disabled={sending || !inputText.trim()}>
                      <Send className="w-4 h-4" />
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      <Modal
        isOpen={modalNewChat}
        onClose={() => setModalNewChat(false)}
        title="Nova conversa"
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalNewChat(false)}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              onClick={createConversation}
              disabled={
                creating ||
                (newChatType === 'DIRECT' && selectedUserIds.length !== 1) ||
                (newChatType === 'GROUP' && selectedUserIds.length < 1)
              }
            >
              {creating ? 'Criando...' : 'Iniciar conversa'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Tipo</label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="chatType"
                  checked={newChatType === 'DIRECT'}
                  onChange={() => {
                    setNewChatType('DIRECT')
                    setSelectedUserIds((prev) => (prev.length > 1 ? [prev[0]] : prev))
                  }}
                  className="text-orange-600"
                />
                Conversa direta (1 pessoa)
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="chatType"
                  checked={newChatType === 'GROUP'}
                  onChange={() => setNewChatType('GROUP')}
                  className="text-orange-600"
                />
                Grupo (várias pessoas)
              </label>
            </div>
          </div>
          {newChatType === 'GROUP' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nome do grupo (opcional)</label>
              <input
                type="text"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder="Ex.: Equipe pedagógica"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {newChatType === 'DIRECT' ? 'Selecione a pessoa' : 'Selecione os participantes'}
            </label>
            <div className="max-h-60 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
              {chatUsers.map((u) => (
                <label
                  key={u.id}
                  className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectedUserIds.includes(u.id)}
                    onChange={() => toggleUser(u.id)}
                    className="rounded border-gray-300 text-orange-600"
                  />
                  <div>
                    <p className="font-medium text-gray-900">{u.nome}</p>
                    <p className="text-xs text-gray-500">
                      {u.roleLabel} · {u.email}
                    </p>
                  </div>
                </label>
              ))}
            </div>
          </div>
        </div>
      </Modal>
    </AdminLayout>
  )
}
