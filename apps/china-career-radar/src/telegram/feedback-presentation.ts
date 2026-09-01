import { InlineKeyboard } from "grammy";

export type FeedbackAction = "interest" | "dismiss" | "applied" | "closed";

export interface FeedbackPresentation {
  text: string;
  replyMarkup?: InlineKeyboard;
  toast: string;
}

export function effectiveFeedbackAction(
  requested: FeedbackAction,
  jobStatus: string | undefined,
): FeedbackAction {
  return jobStatus === "closed" ? "closed" : requested;
}

export function presentFeedback(
  text: string,
  action: FeedbackAction,
  candidateId: string,
  jobId: string,
): FeedbackPresentation {
  const labels: Record<FeedbackAction, string> = {
    interest: "Интересно",
    dismiss: "Мимо",
    applied: "Откликнулся",
    closed: "Закрыта",
  };
  const icons: Record<FeedbackAction, string> = {
    interest: "✅",
    dismiss: "🚫",
    applied: "📨",
    closed: "⛔",
  };
  const cleanText = text.replace(/\nСтатус: [^\n]*/gu, "").trimEnd();
  const updatedText = `${cleanText}\n\nСтатус: ${icons[action]} ${labels[action]}`;

  if (action === "closed")
    return {
      text: updatedText,
      toast: `Сохранено: ${labels[action]}`,
    };

  const buttonText = (buttonAction: FeedbackAction) =>
    buttonAction === action
      ? `${icons[buttonAction]} ${labels[buttonAction]}`
      : labels[buttonAction];
  const replyMarkup = new InlineKeyboard()
    .text(buttonText("interest"), `interest:${candidateId}:${jobId}`)
    .text(buttonText("dismiss"), `dismiss:${candidateId}:${jobId}`)
    .row()
    .text(buttonText("applied"), `applied:${candidateId}:${jobId}`)
    .text(buttonText("closed"), `closed:${candidateId}:${jobId}`);

  return {
    text: updatedText,
    replyMarkup,
    toast: `Сохранено: ${labels[action]}`,
  };
}
