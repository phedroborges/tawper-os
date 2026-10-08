-- WhatsApp do contato: 55 + DDD + celular, somente dígitos (13). Sem + e sem máscara.
-- CNPJ já era 14 dígitos; esta migration só ajusta o WhatsApp.
-- Dropar o CHECK antigo ANTES do UPDATE: ele exige E.164 com + e bloqueia o valor só com dígitos.

alter table public.contacts drop constraint if exists contacts_whatsapp_e164_check;
alter table public.contacts drop constraint if exists contacts_whatsapp_e164_digits_chk;

update public.contacts
   set whatsapp_e164 = nullif(regexp_replace(whatsapp_e164, '\D', '', 'g'), '')
 where whatsapp_e164 is not null;

update public.contacts
   set whatsapp_e164 = case
         when whatsapp_e164 like '55%' and length(whatsapp_e164) = 13 then whatsapp_e164
         when length(whatsapp_e164) in (10, 11) then '55' || whatsapp_e164
         else whatsapp_e164
       end
 where whatsapp_e164 is not null;

update public.contacts
   set whatsapp_e164 = null
 where whatsapp_e164 is not null
   and whatsapp_e164 !~ '^55[1-9][0-9]{10}$';

alter table public.contacts
  add constraint contacts_whatsapp_e164_digits_chk
  check (whatsapp_e164 is null or whatsapp_e164 ~ '^55[1-9][0-9]{10}$');

comment on column public.contacts.whatsapp_e164 is 'Celular brasileiro: 55 + DDD + celular. Somente números, sem +. A máscara (DD) 99999-9999 fica só na interface.';
