import { Bot, Check } from "lucide-react"

export type Message = {
  id: string
  role: "user" | "assistant"
  content: string
  timestamp: Date
}

type Props = {
  message: Message
  selected: boolean
  onToggleSelect: (id: string) => void
}

export function AIMessage({ message, selected, onToggleSelect }: Props) {
  const isUser = message.role === "user"

  return (
    <div
      className={`flex gap-2 group transition-colors ${isUser ? "flex-row-reverse" : "flex-row"} ${
        selected ? "bg-primary/5 rounded-xl px-2 -mx-2" : ""
      }`}
    >
      {/* 어시스턴트 아이콘 */}
      {!isUser && (
        <div className="flex-shrink-0 w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center mt-1">
          <Bot className="w-4 h-4 text-primary" />
        </div>
      )}

      <div className={`flex flex-col gap-1 min-w-0 flex-1 ${isUser ? "items-end" : "items-start"}`}>
        <div
          className={`rounded-2xl px-3.5 py-2.5 text-[14px] leading-relaxed whitespace-pre-wrap break-words ${
            isUser
              ? "bg-primary text-primary-foreground rounded-tr-sm max-w-[85%]"
              : "bg-muted text-foreground rounded-tl-sm w-full"
          }`}
        >
          {message.content}
        </div>
        <span className="text-[11px] text-muted-foreground/50 px-1">
          {message.timestamp.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}
        </span>
      </div>

      {/* 선택 체크박스 (어시스턴트 메시지만) */}
      {!isUser && (
        <button
          onClick={() => onToggleSelect(message.id)}
          title="내보내기 선택"
          className={`flex-shrink-0 self-start mt-1 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all
            ${selected
              ? "opacity-100 bg-primary border-primary"
              : "opacity-0 group-hover:opacity-100 border-muted-foreground/30 bg-background hover:border-primary/50"
            }`}
        >
          {selected && <Check className="w-3 h-3 text-primary-foreground" />}
        </button>
      )}
    </div>
  )
}
