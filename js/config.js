// =====================================================================
//  INSTELLINGEN — dit is het enige bestand dat je zelf hoeft in te vullen.
//  Laat je SUPABASE_URL leeg, dan draait de app in DEMO-modus
//  (alles blijft dan alleen in je eigen browser).
//
//  De "anon key" is bedoeld om openbaar in een website te staan: de
//  beveiliging zit in de database zelf (zie supabase/schema.sql).
//  Zet hier NOOIT de "service_role" key neer.
// =====================================================================
window.APP_CONFIG = {
  // Supabase → Project Settings → Data API → Project URL
  SUPABASE_URL: 'https://dluuwvotaslkukrtcylq.supabase.co',

  // Supabase → Project Settings → API Keys → "anon" / "publishable" key
  SUPABASE_ANON_KEY: 'sb_publishable_T0Hv81aEamxdU9M_Cff9Zw_oLOpe7K1',

  // Inloggen met alleen een gebruikersnaam? Dan wordt dit erachter geplakt.
  // Voorbeeld: gebruikersnaam "marieke" → marieke@bonnetjes.app
  USERNAME_DOMAIN: 'bonnetjes.app',

  // Na zoveel minuten niets doen word je automatisch uitgelogd.
  INACTIVITY_MINUTES: 60,
};
