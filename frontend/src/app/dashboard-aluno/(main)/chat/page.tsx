/**
 * Chat – aluno: conversas com funcionários e professores (somente as que o aluno participa).
 */

'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Button from '@/components/ui/Button'
import Modal from '@/components/admin/Modal'
import Toast from '@/components/admin/Toast'
import { MessageCircle, Send, Users, ArrowLeft, PlusCircle } from 'lucide-react'

const API = '/api/student/chat'

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

function conversationTitle(conv: Conversation): string {
  if (conv.type === 'GROUP' && conv.name) return conv.name
  if (conv.participants.length === 1) {
    const p = conv.participants[0]
    return p.nome + ' (' + p.roleLabel + ')'
  }
  return conv.participants.map((p) => p.nome).join(', ')
}

/** Nome do professor na conversa selecionada (para exibir no cabeçalho). */
function selectedProfessorName(conv: Conversation | undefined): string | null {
  if (!conv || conv.participants.length === 0) return null
  const professor = conv.participants.find((p) => p.role === 'TEACHER')
  return professor ? professor.nome : null
}

export default function AlunoChatPage() {
  const router = useRouter()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [inputText, setInputText] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [modalNewChat, setModalNewChat] = useState(false)
  const [chatUsers, setChatUsers] = useState<ChatUser[]>([])
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [usersLoading, setUsersLoading] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch(`${API}/conversations`, { credentials: 'include' })
      if (res.status === 401 || res.status === 403) {
        router.push('/login')
        return
      }
      const json = await res.json()
      if (res.ok && json.ok) setConversations(json.data.conversations ?? [])
      else setConversations([])
    } catch {
      setConversations([])
    }
  }, [router])

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
      if (res.ok && json.ok && json.data?.message) {
        setMessages((prev) => [...prev, json.data.message])
      } else {
        setInputText(text)
      }
    } catch {
      setInputText(text)
    } finally {
      setSending(false)
    }
  }

  const openNewChatModal = useCallback(async () => {
    setModalNewChat(true)
    setSelectedUserId(null)
    setUsersLoading(true)
    try {
      const res = await fetch(`${API}/users`, { credentials: 'include' })
      if (res.status === 401 || res.status === 403) {
        router.push('/login')
        return
      }
      const json = await res.json()
      if (res.ok && json.ok) setChatUsers(json.data ?? [])
      else setChatUsers([])
    } catch {
      setChatUsers([])
    } finally {
      setUsersLoading(false)
    }
  }, [router])

  const createConversation = async () => {
    if (!selectedUserId || creating) return
    setCreating(true)
    try {
      const res = await fetch(`${API}/conversations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ participantIds: [selectedUserId] }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) {
        setToast({ message: json.message || 'Erro ao iniciar conversa', type: 'error' })
        return
      }
      const conv = json.data.conversation
      setConversations((prev) => {
        const exists = prev.some((c) => c.id === conv.id)
        if (exists) return prev.map((c) => (c.id === conv.id ? conv : c))
        return [conv, ...prev]
      })
      setSelectedId(conv.id)
      setModalNewChat(false)
      setSelectedUserId(null)
    } finally {
      setCreating(false)
    }
  }

  const selectedConv = conversations.find((c) => c.id === selectedId)

  return (
    <div className="flex flex-col min-h-0 h-[calc(100vh-8rem)]">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Chat</h1>
      <p className="text-sm text-gray-600 mb-4">
        Suas conversas com a equipe e professores. Inicie uma nova conversa ou selecione uma existente.
      </p>

      <div className="flex-1 flex min-h-0 rounded-xl border border-gray-200 bg-white overflow-hidden flex-col md:flex-row">
        <div className={`flex flex-col border-r border-gray-200 md:w-80 w-full min-h-0 ${selectedId ? 'hidden md:flex' : 'flex'}`}>
          <div className="border-b border-gray-200 p-2 shrink-0">
            <Button
              variant="primary"
              onClick={openNewChatModal}
              className="w-full flex items-center justify-center gap-2"
            >
              <PlusCircle className="w-5 h-5" />
              Nova conversa
            </Button>
          </div>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide px-4 pt-3 pb-2">Conversas</p>
          {loading ? (
            <div className="p-4 text-gray-500">Carregando...</div>
          ) : conversations.length === 0 ? (
            <div className="p-4 text-gray-500 text-sm">Nenhuma conversa ainda. Clique em &quot;Nova conversa&quot; para iniciar.</div>
          ) : (
            <ul className="overflow-y-auto flex-1">
              {conversations.map((conv) => (
                <li key={conv.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(conv.id)}
                    className={`w-full text-left px-4 py-3 border-b border-gray-100 hover:bg-gray-50 flex flex-col gap-0.5 ${
                      selectedId === conv.id ? 'bg-orange-50 border-l-4 border-l-orange-500' : ''
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <span className="font-medium text-gray-900 truncate">{conversationTitle(conv)}</span>
                      {(conv.unreadCount ?? 0) > 0 && (
                        <span className="shrink-0 w-2 h-2 rounded-full bg-red-500" />
                      )}
                    </span>
                    {conv.lastMessage && (
                      <span className="text-xs text-gray-500 truncate">{conv.lastMessage.content}</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className={`flex-1 flex flex-col min-w-0 min-h-0 ${selectedId ? 'flex' : 'hidden md:flex'}`}>
          {!selectedConv ? (
            <div className="flex-1 flex items-center justify-center text-gray-500 p-4">
              <div className="text-center">
                <MessageCircle className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                <p className="text-sm">Selecione uma conversa na lista ou inicie uma nova</p>
                <Button variant="primary" onClick={openNewChatModal} className="mt-3">
                  Nova conversa
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setSelectedId(null)}
                  className="md:hidden p-2 -ml-1 rounded-lg text-gray-600 hover:bg-gray-200 flex items-center gap-1"
                >
                  <ArrowLeft className="w-5 h-5" />
                  <span className="text-sm">Voltar</span>
                </button>
                <Users className="w-5 h-5 text-gray-500 shrink-0 hidden md:block" />
                <div className="flex-1 min-w-0 flex flex-col">
                  {(() => {
                    const professorName = selectedProfessorName(selectedConv)
                    if (professorName) {
                      return (
                        <>
                          <span className="text-xs text-gray-500">Conversando com o professor</span>
                          <span className="font-medium text-gray-900 truncate">{professorName}</span>
                        </>
                      )
                    }
                    return <span className="font-medium text-gray-900 truncate">{conversationTitle(selectedConv)}</span>
                  })()}
                </div>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
                {messages.map((msg) => (
                  <div key={msg.id} className={`flex ${msg.isOwn ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={`max-w-[85%] sm:max-w-[75%] rounded-lg px-3 py-2 break-words ${
                        msg.isOwn ? 'bg-brand-orange text-white' : 'bg-gray-100 text-gray-900'
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
              <div className="p-4 border-t border-gray-200 flex gap-2 shrink-0">
                <input
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                  placeholder="Digite sua mensagem..."
                  className="flex-1 min-w-0 rounded-lg border border-gray-300 px-4 py-2 text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                />
                <Button
                  variant="primary"
                  onClick={sendMessage}
                  disabled={sending || !inputText.trim()}
                  className="shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center"
                >
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            </>
          )}
        </div>
      </div>

      <Modal
        isOpen={modalNewChat}
        onClose={() => {
          setModalNewChat(false)
          setSelectedUserId(null)
        }}
        title="Iniciar conversa"
        size="md"
        footer={
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                setModalNewChat(false)
                setSelectedUserId(null)
              }}
            >
              Cancelar
            </Button>
            <Button
              variant="primary"
              onClick={createConversation}
              disabled={!selectedUserId || creating}
            >
              {creating ? 'Abrindo...' : 'Iniciar conversa'}
            </Button>
          </div>
        }
      >
        <p className="text-sm text-gray-600 mb-4">
          Selecione um professor ou funcionário para iniciar a conversa.
        </p>
        {usersLoading ? (
          <div className="py-8 text-center text-gray-500">Carregando...</div>
        ) : chatUsers.length === 0 ? (
          <div className="py-8 text-center text-gray-500">Nenhum professor ou funcionário disponível.</div>
        ) : (
          <ul className="space-y-1 max-h-64 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
            {chatUsers.map((u) => (
              <li key={u.id}>
                <button
                  type="button"
                  onClick={() => setSelectedUserId(u.id)}
                  className={`w-full text-left px-4 py-3 flex flex-col gap-0.5 hover:bg-gray-50 ${
                    selectedUserId === u.id ? 'bg-orange-50 border-l-4 border-l-orange-500' : ''
                  }`}
                >
                  <span className="font-medium text-gray-900">{u.nome}</span>
                  <span className="text-xs text-gray-500">{u.roleLabel} · {u.email}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Modal>

      {/* Toast de notificação */}
      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
    </div>
  )
}
