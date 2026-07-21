-- Kontakt e-mail na kartotece klienta. Osobny od loginu (User.email):
-- klienta bez konta też chcemy mieć jak powiadomić, a jeden adres bywa
-- kontaktem dla kartotek kilkorga dzieci - stąd nullable i bez unikalności.
ALTER TABLE "Member" ADD COLUMN "email" TEXT;
