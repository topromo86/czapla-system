// Awatar trenera: zdjęcie z endpointu albo inicjały. Świadomie zwykły <img>,
// nie next/image - obrazek idzie z naszego API jako dowolny JPG/PNG/WEBP
// wgrany przez właściciela, więc optymalizator i tak nic by nie wniósł, a
// wymagałby konfiguracji domen.
export function TrainerAvatar({
  trainerId,
  name,
  hasPhoto,
  size = 44,
}: {
  trainerId: string;
  name: string;
  hasPhoto: boolean;
  size?: number;
}) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  if (!hasPhoto) {
    return (
      <span
        aria-hidden
        className="bg-surface-2 text-muted-brand border-line flex shrink-0 items-center justify-center rounded-full border font-mono"
        style={{ width: size, height: size, fontSize: Math.round(size / 3) }}
      >
        {initials}
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/api/trener/${trainerId}/zdjecie`}
      alt={`Zdjęcie: ${name}`}
      width={size}
      height={size}
      className="border-line shrink-0 rounded-full border object-cover"
      style={{ width: size, height: size }}
    />
  );
}
