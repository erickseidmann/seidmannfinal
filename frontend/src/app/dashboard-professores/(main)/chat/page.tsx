/**
 * Chat interno – professor: conversas com funcionários, outros professores e alunos.
 */

'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Modal from '@/components/admin/Modal'
import Button from '@/components/ui/Button'
import { MessageCircle, Send, Users, BookOpen, Calendar, Wallet, GraduationCap } from 'lucide-react'

const SUBJECTS = [
  { key: 'aula', label: 'Aula', icon: GraduationCap },
  { key: 'financeiro', label: 'Financeiro', icon: Wallet },
  { key: 'gestao-aulas', label: 'Gestão de aulas', icon: Calendar },
  { key: 'material', label: 'Material', icon: BookOpen },
] as const

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

/**
 * Converte nome completo em iniciais (ex: "Erick Seidmann" → "E. S.")
 */
function getInitials(nome: string): string {
  const parts = nome.trim().split(/\s+/)
  if (parts.length === 0) return nome.charAt(0).toUpperCase()
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase()
  return parts.map((p) => p.charAt(0).toUpperCase()).join('. ') + '.'
}

function conversationTitle(conv: Conversation): string {
  if (conv.type === 'GROUP' && conv.name) return conv.name
  if (conv.participants.length === 1) {
    const p = conv.participants[0]
    // Em grupos, professores aparecem apenas com iniciais
    if (p.role === 'TEACHER') {
      return getInitials(p.nome) + ' (' + p.roleLabel + ')'
    }
    return p.nome + ' (' + p.roleLabel + ')'
  }
  // Em grupos com múltiplos participantes, professores aparecem apenas com iniciais
  return conv.participants
    .map((p) => (p.role === 'TEACHER' ? getInitials(p.nome) : p.nome))
    .join(', ')
}

const API = '/api/professor/chat'

export default function ProfessorChatPage() {
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
  const [subjectTab, setSubjectTab] = useState<string | null>(null)
  const [subjectUsers, setSubjectUsers] = useState<ChatUser[]>([])
  const [subjectLoading, setSubjectLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch(`${API}/conversations`, { credentials: 'include' })
      const json = await res.json()
      if (res.ok && json.ok) setConversations(json.data.conversations ?? [])
    } catch {
      setConversations([])
    }
  }, [])

  const fetchMessages = useCallback(async (convId: string, before?: string) => {
    try {
      const url = before
        ? `${API}/conversations/${convId}/messages?limit=50&before=${before}`
        : `${API}/conversations/${convId}/messages?limit=50`
      const res = await fetch(url, { credentials: 'include' })
      const json = await res.json()
      if (!res.ok || !json.ok) return []
      return json.data.messages ?? []
    } catch {
      return []
    }
  }, [])

  const markAsRead = useCallback(async (convId: string) => {
    try {
      await fetch(`${API}/conversations/${convId}/messages`, {
        method: 'PATCH',
        credentials: 'include',
      })
      window.dispatchEvent(new CustomEvent('professor-chat-updated'))
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    setLoading(true)
    fetchConversations().finally(() => setLoading(false))
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
      const res = await fetch(`${API}/conversations/${selectedId}/messages`, {
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
      const res = await fetch(`${API}/users`, { credentials: 'include' })
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
      const res = await fetch(`${API}/conversations`, {
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
      window.dispatchEvent(new CustomEvent('professor-chat-updated'))
    } finally {
      setCreating(false)
    }
  }

  const toggleUser = (id: string) => {
    setSelectedUserIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : newChatType === 'DIRECT' ? [id] : [...prev, id]
    )
  }

  const fetchSubjectUsers = useCallback(async (subject: string) => {
    setSubjectLoading(true)
    try {
      const res = await fetch(`${API}/users-by-subject?subject=${subject}`, { credentials: 'include' })
      const json = await res.json()
      if (res.ok && json.ok) setSubjectUsers(json.data ?? [])
      else setSubjectUsers([])
    } catch {
      setSubjectUsers([])
    } finally {
      setSubjectLoading(false)
    }
  }, [])

  useEffect(() => {
    if (subjectTab) fetchSubjectUsers(subjectTab)
    else setSubjectUsers([])
  }, [subjectTab, fetchSubjectUsers])

  const openNewChatWithUser = (user: ChatUser) => {
    setSelectedUserIds([user.id])
    setNewChatType('DIRECT')
    setNewGroupName('')
    setModalNewChat(true)
    setChatUsers([user])
  }

  const openNewGroupWithAllSubject = () => {
    if (subjectUsers.length === 0) return
    setSelectedUserIds(subjectUsers.map((u) => u.id))
    setNewChatType('GROUP')
    setNewGroupName(subjectTab === 'financeiro' ? 'Financeiro' : subjectTab === 'gestao-aulas' ? 'Gestão de aulas' : subjectTab === 'material' ? 'Material' : 'Grupo')
    setModalNewChat(true)
    setChatUsers(subjectUsers)
  }

  const selectedConv = conversations.find((c) => c.id === selectedId)

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-gray-900">Chat</h1>
      </div>
      <p className="text-sm text-gray-600 mb-4">
        Conversas com funcionários e alunos. Use a lista &quot;Por assunto&quot; acima para iniciar uma conversa direta ou criar um grupo.
      </p>

      <div className="flex-1 flex min-h-0 rounded-xl border border-gray-200 bg-white overflow-hidden">
        <div className="w-80 border-r border-gray-200 flex flex-col">
          <div className="border-b border-gray-200 p-2">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Por assunto</p>
            <div className="flex flex-wrap gap-1">
              {SUBJECTS.map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSubjectTab(subjectTab === key ? null : key)}
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${
                    subjectTab === key ? 'bg-brand-orange text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {label}
                </button>
              ))}
            </div>
            {subjectTab && (
              <div className="mt-2 max-h-40 overflow-y-auto border border-gray-100 rounded-lg">
                {subjectLoading ? (
                  <div className="p-2 text-xs text-gray-500">Carregando...</div>
                ) : subjectUsers.length === 0 ? (
                  <div className="p-2 text-xs text-gray-500">Nenhum contato neste assunto.</div>
                ) : (
                  <>
                    {subjectTab !== 'aula' && subjectUsers.length > 1 && (
                      <button
                        type="button"
                        onClick={openNewGroupWithAllSubject}
                        className="w-full text-left px-3 py-2 text-xs font-medium text-brand-orange hover:bg-orange-50 border-b border-gray-100"
                      >
                        Criar grupo com todos ({subjectUsers.length})
                      </button>
                    )}
                    {subjectUsers.map((u) => (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => openNewChatWithUser(u)}
                        className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 flex flex-col gap-0.5 border-b border-gray-50 last:border-0"
                      >
                        <span className="font-medium text-gray-900">{u.nome}</span>
                        <span className="text-gray-500">{u.roleLabel} · {u.email}</span>
                      </button>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide px-4 pt-2 pb-1">Conversas</p>
          {loading ? (
            <div className="p-4 text-gray-500">Carregando...</div>
          ) : conversations.length === 0 ? (
            <div className="p-4 text-gray-500 text-sm">Nenhuma conversa. Use um assunto acima para iniciar uma conversa.</div>
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
              <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex items-center gap-2">
                <Users className="w-5 h-5 text-gray-500" />
                <span className="font-medium text-gray-900">{conversationTitle(selectedConv)}</span>
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
                          {selectedConv?.type === 'GROUP' && msg.senderRole === 'TEACHER'
                            ? getInitials(msg.senderNome)
                            : msg.senderNome}{' '}
                          · {msg.senderRoleLabel}
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
            </>
          )}
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
          <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800">
            Todas as conversas podem ser vistas pela administração (ADM).
          </div>
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
    </div>
  )
}
