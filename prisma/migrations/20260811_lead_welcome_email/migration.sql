-- Powitanie leada można wysłać mailem, nie tylko SMS-em. Klub nie ma jeszcze
-- bramki SMS, a mail działa od razu - historia kontaktu musi rozróżniać kanał,
-- bo "wysłaliśmy" znaczy co innego, gdy poszło esemesem, a co innego mailem.
ALTER TYPE "LeadActivityKind" ADD VALUE 'WELCOME_EMAIL';
