import Link from "next/link";

export function Logo() {
  return (
    <Link href="/" aria-label="VORYNQ home" className="flex items-center gap-3 text-heading">
      <img src="/img/logo.webp" alt="" width={40} height={40} className="size-10 rounded-xl" />
      <span className="text-[19px] font-semibold tracking-[0.28em]">VORYNQ</span>
    </Link>
  );
}
