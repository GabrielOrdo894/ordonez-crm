export type ToastType = 'success' | 'error' | 'warning';
export type ToastItem = { id: number; type: ToastType; message: string };

const TYPE_CLASSES: Record<ToastType, string> = {
  success: 'bg-brand text-white',
  error: 'bg-red-700 text-white',
  warning: 'bg-amber-600 text-white',
};

type ToastContainerProps = {
  toasts: ToastItem[];
};

export function ToastContainer({ toasts }: ToastContainerProps) {
  return (
    <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`px-3 py-2 rounded-sm text-sm shadow-sm animate-[slide-up_200ms_ease-out] ${TYPE_CLASSES[t.type]}`}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
