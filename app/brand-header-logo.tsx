import Image from "next/image";

// Logo klienta ma czarny napis - na ciemnym tle apki potrzebuje jasnej
// "plakietki" pod spodem, inaczej tekst jest nieczytelny.
export function BrandHeaderLogo() {
  return (
    <div className="inline-flex items-center rounded-md bg-white px-2 py-1">
      <Image src="/logo.png" alt="Czapla Boxing" width={100} height={55} priority />
    </div>
  );
}
