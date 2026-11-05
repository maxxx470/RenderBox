/**
 * The relance e-mails themselves, in both languages (2026-10-31, owner;
 * texts validated in the chat before a line of this file existed).
 *
 * House rules these texts obey, the same ones the use-case pages obey:
 *  — « vous » in French, never « tu ».
 *  — Only what the product really does. No user count, no rating, no
 *    testimonial, nothing the landing proof policy forbids.
 *  — NO price, NO credit figure, NO delay in seconds: those live in
 *    pricing-tiers.ts and provider-cost.ts and would drift the day the
 *    owner changes a plan. The e-mails point at the pages that read them.
 *  — Emoji are deliberate here (owner: « on mettra des emoji dans le
 *    texte »). They are text, not UI icons, so the charter's « never emoji
 *    as icons » rule is not in play.
 *
 * A NEW SIGN-UP HAS NO CREDITS (owner, 2026-10-31, choosing A over the
 * welcome-credits option): so not one of these e-mails tells a prospect to
 * « launch your first render » — they would hit the plans dialog and learn
 * we promised what they cannot do. The prospect e-mails show what the
 * product makes, then name the price page plainly.
 */
import 'server-only';
import { SITE_URL } from '@/lib/seo';
import type { Locale } from '@/lib/i18n/dictionaries';
import type { ReengagementKind } from './schedule';

export interface RelanceEmail {
  subject: string;
  html: string;
  text: string;
}

export interface RelanceContext {
  /** The account's first name, or null — the greeting drops it then. */
  firstName: string | null;
  locale: Locale;
  /** Absolute, signed unsubscribe URL (unsubscribe-token.ts). */
  unsubscribeUrl: string;
}

function htmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function url(path: string, locale: Locale): string {
  return `${SITE_URL}${path}${path.includes('?') ? '&' : '?'}lang=${locale}`;
}

interface Body {
  subject: string;
  /** The grey line mail clients show beside the subject. */
  preheader: string;
  /** Paragraphs. A string starting with « • » is rendered as a list line. */
  paragraphs: readonly string[];
  cta: { label: string; href: string } | null;
  signature: string;
}

// The charter's blues (CLAUDE.md), plus the one red highlight it allows
// per screen. Spelled out here rather than imported: this module renders
// into an inbox, where no stylesheet of ours is loaded.
const BLUE = '#2948FC';
const BLUE_BRIGHT = '#435CFE';
const BLUE_DEEP = '#1E36D6';
const RED = '#F34857';
const INK = '#17161F';
const INK2 = '#3D3B49';
const MUTED = '#8A8896';
const LINE = '#ECECF2';
const TINT = '#F4F6FF';
const GROUND = '#EEEEF1';

// Absolute URLs: a mail client has no origin to resolve a path against.
// Served from public/brand/ and checked live before this was written.
const SITE = 'https://www.renderpro.app';
const LOGO_WHITE = `${SITE}/brand/logo-renderpro-blanc.png`;
const MARK = `${SITE}/brand/mark-72.png`;

function layout(body: Body, ctx: RelanceContext): RelanceEmail {
  const hello =
    ctx.locale === 'fr'
      ? ctx.firstName
        ? `Bonjour ${ctx.firstName},`
        : 'Bonjour,'
      : ctx.firstName
        ? `Hi ${ctx.firstName},`
        : 'Hi,';

  const unsubLabel =
    ctx.locale === 'fr' ? 'Ne plus recevoir ces e-mails' : 'Stop receiving these emails';
  const unsubNote =
    ctx.locale === 'fr'
      ? 'Vous recevez cet e-mail parce que vous avez créé un compte RenderPro.'
      : 'You are receiving this because you created a RenderPro account.';

  // ── The shape of these e-mails (2026-11-05) ─────────────────────────
  //
  // Two earlier designs were wrong, and both are worth recording so the
  // next person does not repeat them. The first was a small newsletter
  // card and landed in Gmail's Promotions tab. The second was stripped
  // bare — no card, no button, no letterhead — on the theory that design
  // is what Gmail reads. The owner then produced a counter-example that
  // settles it: a Wispr Flow announcement, a full newsletter with a logo
  // image, a serif display headline, hero pictures, buttons and a postal
  // address, sitting in their Primary tab.
  //
  // So design does NOT decide the tab, and holding these e-mails plain
  // bought nothing. What separates the two senders is measurable
  // elsewhere: wispr.ai publishes DMARC `p=reject` with a reporting
  // address and years of engaged volume; renderpro.app sits at `p=none`
  // with no rua and sent its first bulk mail on 2026-11-05. Reputation
  // is earned, not configured.
  //
  // This layout is therefore designed on purpose, in the charter's own
  // blues, opening on the brand the way the reference does.
  //
  // Three things an inbox forces that a browser does not:
  //   · the logo is a hosted PNG at an absolute URL — a mail client
  //     cannot resolve a relative path, and every image carries alt
  //     text because Gmail hides images until a sender is trusted, so
  //     the e-mail must still read with every picture missing;
  //   · the gradient carries a solid `background-color` under it, since
  //     Outlook drops `background-image` and would otherwise paint white
  //     text on white;
  //   · the display face is Georgia, not Poppins — web fonts do not load
  //     in most clients, and Georgia is the one serif present on all of
  //     them.
  //
  // What no redesign may remove: the List-Unsubscribe header and the
  // footer link. A reader with no way out clicks « Spam », and the
  // sign-in codes leave from this same domain.
  const blocks = body.paragraphs
    .map((para) => {
      const safe = htmlEscape(para);
      if (para.startsWith('•')) {
        return (
          `<tr><td style="padding:0 0 12px"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>` +
          `<td width="18" valign="top" style="padding-top:8px"><div style="width:5px;height:5px;border-radius:3px;background:${RED}"></div></td>` +
          `<td style="font-size:16px;line-height:1.65;color:${INK2}">${safe.replace('•', '').trim()}</td>` +
          `</tr></table></td></tr>`
        );
      }
      return `<tr><td style="padding:0 0 18px;font-size:16px;line-height:1.68;color:${INK}">${safe}</td></tr>`;
    })
    .join('');

  const action = body.cta
    ? `<tr><td align="center" style="padding:14px 0 6px">` +
      `<a href="${htmlEscape(body.cta.href)}" style="display:inline-block;background:${BLUE};background-image:linear-gradient(135deg,${BLUE_BRIGHT} 0%,${BLUE} 48%,${BLUE_DEEP} 100%);color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;padding:15px 30px;border-radius:12px">${htmlEscape(body.cta.label)}</a>` +
      `</td></tr>`
    : '';

  const eyebrow = ctx.locale === 'fr' ? 'RENDU ARCHITECTURAL PAR IA' : 'AI ARCHITECTURAL RENDERING';

  const html =
    `<div style="background:${GROUND};padding:28px 14px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">` +
    `<table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:20px;overflow:hidden">` +
    // ── The brand band: the white lockup on the charter gradient. ──
    `<tr><td align="center" bgcolor="${BLUE}" style="background-color:${BLUE};background-image:linear-gradient(135deg,${BLUE_BRIGHT} 0%,${BLUE} 48%,${BLUE_DEEP} 100%);padding:38px 28px 34px">` +
    `<img src="${LOGO_WHITE}" width="188" height="47" alt="RenderPro" style="display:block;border:0;width:188px;height:auto;max-width:70%">` +
    `<div style="height:16px;line-height:16px">&nbsp;</div>` +
    `<div style="font-size:10.5px;font-weight:700;letter-spacing:2.4px;color:#C9D2FF">${eyebrow}</div>` +
    `</td></tr>` +
    // ── The subject, promoted to a display headline. ──
    `<tr><td style="padding:40px 34px 0">` +
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">` +
    `<tr><td align="center" style="font-family:Georgia,'Times New Roman',serif;font-size:32px;line-height:1.22;color:${INK};padding:0 0 14px">${htmlEscape(body.subject)}</td></tr>` +
    // The preheader, which used to hide in an invisible div, read aloud.
    `<tr><td align="center" style="font-size:16px;line-height:1.55;color:${MUTED};padding:0 0 28px">${htmlEscape(body.preheader)}</td></tr>` +
    `<tr><td style="padding:0 0 26px"><div style="height:2px;width:42px;margin:0 auto;background:${RED};border-radius:2px"></div></td></tr>` +
    `<tr><td style="padding:0 0 18px;font-size:16px;line-height:1.68;color:${INK}">${htmlEscape(hello)}</td></tr>` +
    blocks +
    action +
    `<tr><td style="padding:26px 0 0;font-size:16px;line-height:1.68;color:${INK}">${htmlEscape(body.signature)}</td></tr>` +
    `<tr><td style="padding:30px 0 34px"><div style="height:1px;background:${LINE}"></div></td></tr>` +
    `</table></td></tr>` +
    // ── Footer: the mark, then the way out. ──
    `<tr><td align="center" bgcolor="${TINT}" style="background-color:${TINT};padding:26px 30px 28px">` +
    `<img src="${MARK}" width="26" height="26" alt="" style="display:block;border:0;width:26px;height:26px">` +
    `<div style="height:12px;line-height:12px">&nbsp;</div>` +
    `<div style="font-size:12px;line-height:1.7;color:${MUTED}">${htmlEscape(unsubNote)}<br>` +
    `<a href="${htmlEscape(ctx.unsubscribeUrl)}" style="color:${BLUE_DEEP};text-decoration:underline">${unsubLabel}</a></div>` +
    `</td></tr>` +
    `</table></div>`;

  const text = [
    hello,
    '',
    ...body.paragraphs.map((p) => (p.startsWith('•') ? `  -${p.slice(1)}` : p)),
    ...(body.cta ? ['', `${body.cta.label} : ${body.cta.href}`] : []),
    '',
    body.signature,
    '',
    '—',
    `${unsubNote} ${unsubLabel} : ${ctx.unsubscribeUrl}`,
  ].join('\n');

  return { subject: body.subject, html, text };
}

const SIGN_FR = 'L’équipe RenderPro';
const SIGN_EN = 'The RenderPro team';

function bodyFor(kind: ReengagementKind, locale: Locale): Body {
  const fr = locale === 'fr';
  const cases = url('/rendu', locale);
  const plans = url('/#tarifs', locale);
  const app = url('/app', locale);
  const appPlans = url('/app/tarifs', locale);

  switch (kind) {
    case 'prospect_day1':
      return fr
        ? {
            subject: 'Voici ce que RenderPro fait de votre image',
            preheader: 'Un croquis, une capture SketchUp, un plan 2D, une photo.',
            paragraphs: [
              'Vous avez créé votre compte RenderPro hier — merci. 🙏',
              'RenderPro part d’une seule image et en fait un rendu. Vous pouvez lui donner :',
              '• ✏️ un croquis à la main',
              '• 🖥️ une capture SketchUp, Revit, ArchiCAD ou Rhino',
              '• 📐 un plan 2D',
              '• 📷 une photo d’un bâtiment existant',
              'Le cadrage, les proportions et l’architecture de votre image restent la référence : RenderPro change le rendu, pas votre projet.',
              'Avant de vous décider, regardez ce que ça donne — chaque usage a sa page, avec des exemples. 👇',
            ],
            cta: { label: 'Voir ce que ça donne →', href: cases },
            signature: SIGN_FR,
          }
        : {
            subject: 'Here is what RenderPro makes of your image',
            preheader: 'A sketch, a SketchUp capture, a 2D plan, a photo.',
            paragraphs: [
              'You created your RenderPro account yesterday — thank you. 🙏',
              'RenderPro starts from a single image and turns it into a render. You can hand it:',
              '• ✏️ a hand sketch',
              '• 🖥️ a SketchUp, Revit, ArchiCAD or Rhino capture',
              '• 📐 a 2D plan',
              '• 📷 a photo of an existing building',
              'Your framing, proportions and architecture stay the reference: RenderPro changes the render, not your project.',
              'Before you decide anything, see the results — each use has its own page, with examples. 👇',
            ],
            cta: { label: 'See the results →', href: cases },
            signature: SIGN_EN,
          };

    case 'prospect_day4':
      return fr
        ? {
            subject: 'Tout ce que RenderPro sait faire d’une seule image',
            preheader: 'Rendu de jour, de nuit, intérieur, plan 3D, axonométrie éclatée…',
            paragraphs: [
              'Vous n’avez pas encore lancé de rendu — peut-être que vous ne saviez pas par où commencer. Voici ce que RenderPro fait, à partir d’une seule image : 👇',
              '• ☀️ un rendu extérieur de jour, à partir d’un croquis ou d’un modèle',
              '• 🌙 un rendu de nuit, lumières allumées, ciel sombre',
              '• 🛋️ un rendu intérieur, matériaux et mobilier en place',
              '• 🏠 un plan 2D transformé en 3D aménagée',
              '• 🧩 une axonométrie éclatée, niveau par niveau',
              '• 📋 une planche d’analyse pour présenter un projet',
              '• 🧱 une maquette blanche ou isométrique',
              '• ✨ et « Améliorer » un rendu que vous avez déjà : netteté, matériaux, lumière, ciel',
              'Chaque usage a sa page avec des exemples : vous voyez le résultat avant d’essayer.',
            ],
            cta: { label: 'Voir les exemples →', href: cases },
            signature: SIGN_FR,
          }
        : {
            subject: 'Everything RenderPro can do with one image',
            preheader: 'Day render, night render, interior, 3D plan, exploded axonometric…',
            paragraphs: [
              'You haven’t run a render yet — maybe you weren’t sure where to start. Here is what RenderPro does from a single image: 👇',
              '• ☀️ a daylight exterior render, from a sketch or a model',
              '• 🌙 a night render, lights on, dark sky',
              '• 🛋️ an interior render, materials and furniture in place',
              '• 🏠 a 2D plan turned into a furnished 3D view',
              '• 🧩 an exploded axonometric, floor by floor',
              '• 📋 an analysis board to present a project',
              '• 🧱 a white model or an isometric model',
              '• ✨ and “Enhance” on a render you already have: sharpness, materials, light, sky',
              'Each one has its own page with examples: see the result before you try.',
            ],
            cta: { label: 'See the examples →', href: cases },
            signature: SIGN_EN,
          };

    case 'prospect_day10':
      return fr
        ? {
            subject: 'Quelque chose vous bloque ?',
            preheader: 'Répondez en une ligne — une vraie personne lit.',
            paragraphs: [
              'Vous vous êtes inscrit sur RenderPro, mais vous n’avez rien lancé. Je préfère demander plutôt que deviner : qu’est-ce qui vous retient ?',
              'Répondez à cet e-mail en une ligne — ou écrivez-nous depuis l’application, bouton « Assistant ». 💬 Une vraie personne lit tout, et vous aurez une réponse.',
              'Et si c’est le temps qui vous a manqué, votre compte est toujours là. 👇',
            ],
            cta: { label: 'Reprendre là où j’en étais →', href: app },
            signature: SIGN_FR,
          }
        : {
            subject: 'Is something in the way?',
            preheader: 'Reply in one line — a real person reads it.',
            paragraphs: [
              'You signed up for RenderPro but haven’t run anything yet. I’d rather ask than guess: what’s holding you back?',
              'Reply to this email in one line — or message us from the app, the “Assistant” button. 💬 A real person reads every one, and you will get an answer.',
              'And if it was just time, your account is still there. 👇',
            ],
            cta: { label: 'Pick up where I left off →', href: app },
            signature: SIGN_EN,
          };

    case 'prospect_day18':
      return fr
        ? {
            subject: 'Dernier e-mail de notre part',
            preheader: 'On arrête là — votre compte, lui, reste ouvert.',
            paragraphs: [
              'C’est le dernier e-mail que nous vous envoyons : vous ne serez plus relancé. ✋',
              'Votre compte reste ouvert, et tout ce que RenderPro fait est visible sans s’inscrire — croquis en rendu, plan 2D en 3D, rendu de nuit, planche d’analyse. Si un jour vous avez un projet à présenter, vous saurez où c’est. 🙂',
              'Pour lancer un rendu, il faut une formule : les tarifs sont affichés dans votre devise, et le montant qui s’affiche est celui qui vous est facturé.',
            ],
            cta: { label: 'Voir les formules →', href: plans },
            signature: SIGN_FR,
          }
        : {
            subject: 'Our last email',
            preheader: 'We stop here — your account stays open.',
            paragraphs: [
              'This is the last email we will send you: no more reminders. ✋',
              'Your account stays open, and everything RenderPro does is visible without signing up — sketch to render, 2D plan to 3D, night render, analysis board. If a project to present ever comes up, you will know where we are. 🙂',
              'Running a render needs a plan: prices are shown in your own currency, and the amount you see is the amount you are charged.',
            ],
            cta: { label: 'See the plans →', href: plans },
            signature: SIGN_EN,
          };

    case 'credits_low':
      return fr
        ? {
            subject: 'Il ne vous reste presque plus de crédits',
            preheader: 'Vos prochains rendus pourraient être refusés.',
            paragraphs: [
              'Votre solde arrive à son terme : vos prochains rendus risquent d’être refusés faute de crédits. ⏳',
              'Vous pouvez recharger en une minute depuis la page Abonnement. Le montant affiché est celui qui vous sera facturé, dans votre devise. 💳',
              'Et si vous vous arrêtez là : dites-nous pourquoi, en une ligne. Ça nous aide vraiment. 🙏',
            ],
            cta: { label: 'Voir les formules →', href: appPlans },
            signature: SIGN_FR,
          }
        : {
            subject: 'You are almost out of credits',
            preheader: 'Your next renders may be refused.',
            paragraphs: [
              'Your balance is running out: your next renders may be refused for lack of credits. ⏳',
              'You can top up in a minute from the Subscription page. The amount shown is the amount you will be charged, in your own currency. 💳',
              'And if you are stopping here: tell us why, in one line. It genuinely helps. 🙏',
            ],
            cta: { label: 'See the plans →', href: appPlans },
            signature: SIGN_EN,
          };

    case 'idle_subscriber':
      return fr
        ? {
            subject: 'Votre rendu est toujours dans votre galerie',
            preheader: 'Deux choses que beaucoup découvrent après coup.',
            paragraphs: [
              'Votre galerie n’a pas bougé depuis deux semaines, et votre formule tourne. 📂',
              'Deux choses que beaucoup découvrent après coup :',
              '• 🖼️ Les images de référence. Vous attachez une photo dont vous aimez les matériaux, la végétation ou le ciel, et RenderPro s’en inspire sans jamais toucher à la géométrie de votre bâtiment.',
              '• ⚙️ Les deux moteurs. Visio et Pixel IA ne rendent pas la même image. Lancez la même demande sur les deux et gardez celle que vous préférez.',
            ],
            cta: { label: 'Retourner dans mon espace →', href: app },
            signature: SIGN_FR,
          }
        : {
            subject: 'Your render is still sitting in your gallery',
            preheader: 'Two things most people find out later.',
            paragraphs: [
              'Your gallery hasn’t moved in two weeks, and your plan is running. 📂',
              'Two things most people find out later:',
              '• 🖼️ Reference images. Attach a photo whose materials, planting or sky you like, and RenderPro draws on it without ever changing your building’s geometry.',
              '• ⚙️ The two engines. Visio and Pixel AI don’t produce the same image. Run the same request on both and keep the one you prefer.',
            ],
            cta: { label: 'Back to my workspace →', href: app },
            signature: SIGN_EN,
          };

    case 'lapsed_day7':
      return fr
        ? {
            subject: 'Votre formule RenderPro est arrivée à son terme',
            preheader: 'Vos images restent dans votre galerie.',
            paragraphs: [
              'Votre formule s’est terminée la semaine dernière, et les crédits non utilisés d’une période ne se reportent pas. 📅',
              'Vos images, elles, sont toujours dans votre galerie : rien n’a été supprimé. Vous pouvez reprendre quand un projet le demande.',
            ],
            cta: { label: 'Reprendre une formule →', href: appPlans },
            signature: SIGN_FR,
          }
        : {
            subject: 'Your RenderPro plan has ended',
            preheader: 'Your images stay in your gallery.',
            paragraphs: [
              'Your plan ended last week, and unused credits from a period do not carry over. 📅',
              'Your images are still in your gallery: nothing has been deleted. You can pick a plan back up whenever a project calls for it.',
            ],
            cta: { label: 'Start a plan again →', href: appPlans },
            signature: SIGN_EN,
          };

    case 'lapsed_day30':
      return fr
        ? {
            subject: 'Une question avant qu’on vous laisse tranquille',
            preheader: 'Une ligne suffit — c’est le dernier e-mail sur ce sujet.',
            paragraphs: [
              'Un mois sans formule RenderPro. C’est notre dernier e-mail à ce sujet. ✋',
              'Une seule question, et une ligne suffit : qu’est-ce qui vous a manqué ? Le prix, un usage absent, un rendu qui ne vous a pas convaincu ? Répondez simplement à cet e-mail. 💬',
              'C’est ce qui nous dit quoi construire ensuite. Merci d’avoir essayé. 🙏',
            ],
            cta: null,
            signature: SIGN_FR,
          }
        : {
            subject: 'One question before we leave you alone',
            preheader: 'One line is enough — last email on this.',
            paragraphs: [
              'A month without a RenderPro plan. This is our last email about it. ✋',
              'One question, and one line is enough: what was missing? The price, a use case we don’t cover, a render that didn’t convince you? Just reply to this email. 💬',
              'That is what tells us what to build next. Thank you for giving it a try. 🙏',
            ],
            cta: null,
            signature: SIGN_EN,
          };

    case 'winback':
      return fr
        ? {
            subject: 'RenderPro a changé depuis votre dernier rendu',
            preheader: 'Images de référence, nouvelles ambiances, « Améliorer ».',
            paragraphs: [
              'Ça fait un moment. 👋 Le produit n’est plus celui que vous avez utilisé :',
              '• 🖼️ les images de référence : une photo dont vous aimez les matériaux ou le ciel, sans jamais toucher à la géométrie de votre bâtiment',
              '• 🎨 quatorze ambiances, dont la maquette blanche, l’aquarelle, l’heure dorée et le temps de pluie',
              '• ✨ « Améliorer », pour reprendre un rendu existant : netteté, matériaux, lumière, ciel',
              'Vos anciennes images sont toujours dans votre galerie. Jetez un œil, sans engagement. 👇',
            ],
            cta: { label: 'Voir les nouveautés →', href: cases },
            signature: SIGN_FR,
          }
        : {
            subject: 'RenderPro has changed since your last render',
            preheader: 'Reference images, new ambiances, “Enhance”.',
            paragraphs: [
              'It has been a while. 👋 The product is no longer the one you used:',
              '• 🖼️ reference images: a photo whose materials or sky you like, without ever touching your building’s geometry',
              '• 🎨 fourteen ambiances, among them the white model, watercolour, golden hour and rainy weather',
              '• ✨ “Enhance”, to take an existing render further: sharpness, materials, light, sky',
              'Your old images are still in your gallery. Have a look, no commitment. 👇',
            ],
            cta: { label: 'See what is new →', href: cases },
            signature: SIGN_EN,
          };
  }
}

/** The relance, rendered. */
export function relanceEmail(kind: ReengagementKind, ctx: RelanceContext): RelanceEmail {
  return layout(bodyFor(kind, ctx.locale), ctx);
}
