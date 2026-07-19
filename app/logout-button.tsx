import { signOut } from "@/auth";

export function LogoutButton() {
  return (
    <form
      action={async () => {
        "use server";
        await signOut({ redirectTo: "/login" });
      }}
    >
      <button
        type="submit"
        className="text-muted-brand hover:text-brand-red font-mono text-xs tracking-widest uppercase"
      >
        Wyloguj
      </button>
    </form>
  );
}
