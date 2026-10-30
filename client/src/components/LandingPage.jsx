import { useEffect, useState } from 'react'

// Public landing page at "/". No API calls and no app imports, so FullCalendar, recharts and the rest never download.
// The ef:signedIn hint (signedInHint.js) swaps the login / sign-up buttons for "Open dashboard"; the cookie is httpOnly.

const TITLE = 'EventFlow: bookings, advances and stock for tent and catering businesses'
const SUPPORT_EMAIL = 'eventflow.support@gmail.com'

const readSignedIn = () => {
  try {
    return window.localStorage.getItem('ef:signedIn') === '1'
  } catch {
    return false
  }
}

const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1E6B52]'
const PRESS = 'transition-[transform,background-color,color] duration-[160ms] ease-out active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100'
const BTN = `inline-flex min-h-[44px] items-center justify-center rounded-md bg-[#16181D] px-5 text-[15px] font-medium text-white hover:bg-[#383D47] ${PRESS} ${FOCUS}`
const LINK = `inline-flex min-h-[44px] items-center text-[15px] text-[#16181D] underline underline-offset-4 hover:text-[#1E6B52] ${FOCUS}`
const WRAP = 'mx-auto w-full max-w-[1120px] px-5 sm:px-8'
const H2 = 'text-[clamp(1.75rem,3.2vw,2.5rem)] font-semibold leading-[1.1] tracking-[-0.02em]'

const Mark = () => (
  <svg viewBox="0 0 32 32" fill="none" className="h-7 w-7" aria-hidden="true">
    <path d="M3 26 16 8l13 18h-9l-4-8-4 8H3Z" stroke="#16181D" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="16" cy="7" r="2.6" fill="#1E6B52" />
  </svg>
)

const NAV_LINKS = [
  ['Features', '#features'],
  ['How it works', '#how-it-works'],
  ['FAQ', '#faq'],
]

const Nav = ({ signedIn }) => {
  const [open, setOpen] = useState(false)
  const navLink = `inline-flex min-h-[44px] items-center text-[15px] text-[#5B616B] hover:text-[#16181D] ${PRESS} ${FOCUS}`
  return (
    <header className="border-b border-[#E6E8EB]">
      <div className={`${WRAP} flex min-h-[64px] items-center justify-between gap-4`}>
        <a href="/" className={`inline-flex min-h-[44px] items-center gap-2 text-[17px] font-semibold ${FOCUS}`}>
          <Mark />
          EventFlow
        </a>
        <nav aria-label="Main" className="hidden items-center gap-6 md:flex">
          {NAV_LINKS.map(([label, href]) => (
            <a key={href} href={href} className={navLink}>{label}</a>
          ))}
        </nav>
        <div className="flex items-center gap-2 sm:gap-4">
          {signedIn ? (
            <a href="/app" className={BTN}>Open dashboard</a>
          ) : (
            <>
              <a href="/login" className={navLink}>Log in</a>
              <a href="/signup" className={`${BTN} hidden sm:inline-flex`}>Create free account</a>
            </>
          )}
          <button
            type="button"
            aria-expanded={open}
            aria-controls="mobile-menu"
            onClick={() => setOpen((value) => !value)}
            className={`inline-flex min-h-[44px] items-center rounded-md border border-[#D5D8DD] px-3 text-[15px] md:hidden ${PRESS} ${FOCUS}`}
          >
            Menu
          </button>
        </div>
      </div>
      {open && (
        <div id="mobile-menu" className="border-t border-[#E6E8EB] md:hidden">
          <nav aria-label="Menu" className={`${WRAP} flex flex-col py-2`}>
            {NAV_LINKS.map(([label, href]) => (
              <a key={href} href={href} onClick={() => setOpen(false)} className={navLink}>{label}</a>
            ))}
            {!signedIn && <a href="/signup" onClick={() => setOpen(false)} className={`${navLink} sm:hidden`}>Create free account</a>}
          </nav>
        </div>
      )}
    </header>
  )
}

// Static February 2026 (1 Feb is a Sunday, so four full rows). Decorative; the hero carries a text description.
const CAL = {
  6: [['Mehta engagement', 'confirmed']],
  10: [['Verma birthday', 'pending']],
  14: [['Rao wedding', 'confirmed'], ['Iyer wedding', 'confirmed']],
  20: [['Corporate dinner', 'cancelled']],
  24: [['Joshi reception', 'confirmed']],
}
const CHIP = {
  confirmed: 'bg-[#1E6B52] text-white',
  pending: 'bg-[#FEF3C7] text-[#78350F]',
  cancelled: 'bg-[#F1F2F4] text-[#5B616B] line-through',
}

const MonthFragment = () => (
  <div aria-hidden="true" className="select-none rounded-lg border border-[#D5D8DD] bg-white">
    <div className="flex items-baseline justify-between border-b border-[#E6E8EB] px-4 py-3">
      <span className="text-[15px] font-semibold">February 2026</span>
      <span className="text-[13px] text-[#5B616B]">Shree Ganesh Caterers</span>
    </div>
    <div className="grid grid-cols-7 text-[11px] text-[#5B616B]">
      {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
        <div key={day} className="px-1.5 py-1.5 sm:px-2">{day}</div>
      ))}
      {Array.from({ length: 28 }, (_, index) => {
        const date = index + 1
        const items = CAL[date] ?? []
        const clash = date === 14
        return (
          <div
            key={date}
            className={`min-h-[76px] border-t border-[#E6E8EB] p-1 sm:min-h-[92px] sm:p-1.5 ${index % 7 ? 'border-l' : ''} ${clash ? 'bg-[#FEF3F2]' : ''}`}
          >
            <div className="mb-1 text-[11px] text-[#5B616B]">{date}</div>
            <div className="flex flex-col gap-0.5">
              {items.map(([label, status]) => (
                <div key={label} className={`truncate rounded-sm px-1 py-0.5 text-[10px] leading-tight sm:text-[11px] ${CHIP[status]}`}>
                  {label}
                </div>
              ))}
              {clash && <div className="text-[10px] font-semibold leading-tight text-[#B42318] sm:text-[11px]">Date clash</div>}
            </div>
          </div>
        )
      })}
    </div>
  </div>
)

const ClashNotice = () => (
  <div aria-hidden="true" className="rounded-lg border border-[#D5D8DD] bg-white p-5">
    <div className="border-l-4 border-[#B42318] bg-[#FEF3F2] px-4 py-3">
      <p className="text-[15px] font-semibold text-[#B42318]">Date clash</p>
      <p className="mt-1 text-[14px] text-[#16181D]">14 Feb already has the Rao wedding. You can still save this booking.</p>
    </div>
    <div className="mt-4 flex gap-3 text-[14px]">
      <span className="inline-flex min-h-[40px] items-center rounded-md bg-[#16181D] px-4 font-medium text-white">Save booking</span>
      <span className="inline-flex min-h-[40px] items-center rounded-md border border-[#D5D8DD] px-4">Change date</span>
    </div>
  </div>
)

const StockMeter = () => (
  <div aria-hidden="true" className="rounded-lg border border-[#D5D8DD] bg-white p-5">
    <p className="text-[14px] font-medium">Chairs on 14 Feb</p>
    <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-[#F1F2F4]">
      <div className="bg-[#1E6B52]" style={{ width: '83.33%' }} />
      <div className="bg-[#F59E0B]" style={{ width: '16.67%' }} />
    </div>
    <p className="mt-3 text-[14px]">
      300 owned, 360 asked, <span className="font-semibold text-[#78350F]">60 short</span>
    </p>
  </div>
)

const FeatureRow = ({ title, body, visual }) => (
  <div className="grid items-center gap-8 border-t border-[#E6E8EB] py-12 md:grid-cols-2 md:gap-16">
    <div>
      <h3 className="text-[clamp(1.375rem,2.4vw,1.75rem)] font-semibold leading-tight tracking-[-0.01em]">{title}</h3>
      <p className="mt-3 max-w-[48ch] text-[17px] leading-relaxed text-[#5B616B]">{body}</p>
    </div>
    {visual}
  </div>
)

const SMALL_FEATURES = [
  ['WhatsApp in one tap.', 'The confirmation or payment reminder opens in WhatsApp, filled in and signed with your business name. You press send.'],
  ['Pending balances in one list.', 'Every booking with money still to come, and how much.'],
  ['Reports and Excel.', 'Pick a date range for a printable report or PDF. Download your records as an Excel file.'],
  ['Morning briefing.', 'Open the app to a short note: events this week, balances due and your next event.'],
]

const Bullets = ({ items }) => (
  <ul className="mt-8 grid max-w-[760px] gap-4">
    {items.map((item) => (
      <li key={item} className="border-t border-[#E6E8EB] pt-4 text-[17px] leading-relaxed">{item}</li>
    ))}
  </ul>
)

const FAQ = [
  ['Is it free?', 'Yes. Creating an account and using EventFlow is free.'],
  ['Does EventFlow message my clients itself?', 'No. It opens WhatsApp with the message ready, and you send it yourself.'],
  ['What happens if two bookings fall on the same day?', 'You see a clash alert. You can still save both.'],
  ["What if I don't have enough chairs for an event?", 'You see what is short for that date, and you can confirm anyway if you have a plan.'],
  ['Can I get my data out?', `Download your records as Excel any time. For a full export, write to ${SUPPORT_EMAIL}.`],
  ['Can I delete my account?', 'Yes, from Profile. You confirm with your password and business name, and everything is deleted at once.'],
  ['Do I need to install anything?', 'No. EventFlow runs in your web browser.'],
]

export default function LandingPage() {
  const [signedIn] = useState(readSignedIn)

  useEffect(() => {
    document.title = TITLE
  }, [])

  const signup = signedIn ? (
    <a href="/app" className={BTN}>Open dashboard</a>
  ) : (
    <a href="/signup" className={BTN}>Create free account</a>
  )

  return (
    <div className="min-h-screen bg-white text-[#16181D] antialiased">
      <a
        href="#main"
        className={`sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-10 focus:rounded-md focus:bg-white focus:px-4 focus:py-3 ${FOCUS}`}
      >
        Skip to content
      </a>
      <Nav signedIn={signedIn} />
      <main id="main" tabIndex={-1} className="outline-none">
        <section aria-labelledby="hero-title" className={`${WRAP} grid items-center gap-12 py-14 md:py-20 lg:grid-cols-[1fr_1.15fr] lg:gap-14`}>
          <div>
            <h1 id="hero-title" className="text-[clamp(2.25rem,5.4vw,4rem)] font-semibold leading-[1.04] tracking-[-0.03em]">
              Every booking, advance and chair, on one screen.
            </h1>
            <p className="mt-6 max-w-[46ch] text-[18px] leading-relaxed text-[#5B616B]">
              EventFlow keeps your event dates, advances and stock together. It warns you about clashes and short stock, and you decide.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-x-6">
              {signup}
              <a href="#how-it-works" className={LINK}>See how it works</a>
            </div>
            {!signedIn && <p className="mt-4 text-[14px] text-[#5B616B]">Free to use. Sign up with your email.</p>}
          </div>
          <div>
            <p className="sr-only">
              A calendar for February 2026 for Shree Ganesh Caterers. Confirmed, pending and cancelled bookings are marked.
              On 14 February two weddings are booked, and a red Date clash marker shows the overlap.
            </p>
            <MonthFragment />
          </div>
        </section>

        <section aria-labelledby="problem-title" className="border-t border-[#E6E8EB]">
          <div className={`${WRAP} py-16 md:py-24`}>
            <h2 id="problem-title" className={H2}>Right now it lives in three places</h2>
            <Bullets
              items={[
                'Dates and names in the booking register, in pen.',
                'Advances on separate slips, or in your head.',
                'How many chairs are free on the 14th? Only you know.',
              ]}
            />
            <p className="mt-8 max-w-[56ch] text-[19px] leading-relaxed">
              When two families want the same date, or 400 chairs are promised on a day you own 300, you find out late.
            </p>
          </div>
        </section>

        <section id="features" aria-labelledby="features-title" className="scroll-mt-4">
          <div className={`${WRAP} pb-16 pt-4 md:pb-24`}>
            <h2 id="features-title" className={`${H2} mb-10`}>What it does</h2>
            <FeatureRow
              title="Clash alerts that don't stop you."
              body="If a date already has an event, you see it before you save. You decide if you can do both."
              visual={<ClashNotice />}
            />
            <FeatureRow
              title="Stock checked for the event date."
              body="Add chairs, tables and tents to a booking. If that day's other bookings already use them, you see the shortfall and confirm only if you mean it."
              visual={<StockMeter />}
            />
            <div className="grid gap-x-16 border-t border-[#E6E8EB] pt-10 sm:grid-cols-2">
              {SMALL_FEATURES.map(([title, body]) => (
                <div key={title} className="pb-10">
                  <h3 className="text-[19px] font-semibold tracking-[-0.01em]">{title}</h3>
                  <p className="mt-2 text-[16px] leading-relaxed text-[#5B616B]">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="how-it-works" aria-labelledby="how-title" className="scroll-mt-4 border-t border-[#E6E8EB]">
          <div className={`${WRAP} py-16 md:py-24`}>
            <h2 id="how-title" className={H2}>How it works</h2>
            <ol className="mt-8 grid max-w-[760px] list-decimal gap-5 pl-6 text-[17px] leading-relaxed marker:font-semibold marker:text-[#1E6B52]">
              <li className="pl-2"><strong className="font-semibold">Create your account.</strong> Your email, a one-time code, a password.</li>
              <li className="pl-2"><strong className="font-semibold">Add your stock.</strong> Item names and how many you own.</li>
              <li className="pl-2"><strong className="font-semibold">Log your bookings.</strong> Date, client, guests and what they need.</li>
            </ol>
            <div className="mt-8">{signup}</div>
          </div>
        </section>

        <section aria-labelledby="india-title" className="border-t border-[#E6E8EB]">
          <div className={`${WRAP} py-16 md:py-24`}>
            <h2 id="india-title" className={H2}>Built for Indian event businesses</h2>
            <Bullets
              items={[
                'Amounts the way you write them: ₹1,20,000, not ₹120,000.',
                "Dates and 'today' in Indian time, wherever the server is.",
                'Weddings, birthdays, corporate events, or your own event type.',
                'Messages go out on WhatsApp, under your business name.',
              ]}
            />
          </div>
        </section>

        <section aria-labelledby="security-title" className="border-t border-[#E6E8EB]">
          <div className={`${WRAP} py-16 md:py-24`}>
            <h2 id="security-title" className={H2}>Security and privacy</h2>
            <Bullets
              items={[
                'Every account is confirmed with a one-time code sent to your email.',
                'Each business sees only its own bookings, stock and records.',
                'See which devices signed in recently, and sign out the others.',
                'Delete your account from Profile. Everything is removed straight away.',
                'The person who runs EventFlow can technically access the database, and looks at your data only when you ask for help.',
              ]}
            />
            <a href="/privacy" className={`${LINK} mt-4`}>Read the privacy policy</a>
          </div>
        </section>

        <section id="faq" aria-labelledby="faq-title" className="scroll-mt-4 border-t border-[#E6E8EB]">
          <div className={`${WRAP} py-16 md:py-24`}>
            <h2 id="faq-title" className={H2}>FAQ</h2>
            <div className="mt-8 max-w-[760px] border-b border-[#E6E8EB]">
              {FAQ.map(([question, answer]) => (
                <details key={question} className="group border-t border-[#E6E8EB]">
                  <summary className={`flex min-h-[56px] cursor-pointer list-none items-center justify-between gap-4 py-3 text-[17px] font-medium [&::-webkit-details-marker]:hidden ${FOCUS}`}>
                    {question}
                    <span aria-hidden="true" className="text-[22px] text-[#5B616B] group-open:hidden">+</span>
                    <span aria-hidden="true" className="hidden text-[22px] text-[#5B616B] group-open:inline">−</span>
                  </summary>
                  <p className="pb-5 pr-8 text-[16px] leading-relaxed text-[#5B616B]">{answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section aria-labelledby="final-title" className="border-t border-[#E6E8EB]">
          <div className={`${WRAP} py-16 md:py-24`}>
            <h2 id="final-title" className="max-w-[18ch] text-[clamp(2rem,4.4vw,3.25rem)] font-semibold leading-[1.05] tracking-[-0.025em]">
              Put this season's bookings in one place.
            </h2>
            <div className="mt-8">{signup}</div>
          </div>
        </section>
      </main>

      <footer className="border-t border-[#E6E8EB]">
        <div className={`${WRAP} flex flex-col gap-2 py-8 sm:flex-row sm:items-center sm:justify-between`}>
          <p className="flex items-center gap-2 text-[15px] font-semibold"><Mark />EventFlow</p>
          <nav aria-label="Footer" className="flex flex-wrap gap-x-6">
            <a href="/privacy" className={LINK}>Privacy policy</a>
            <a href={`mailto:${SUPPORT_EMAIL}`} className={LINK}>Contact</a>
            <a href="/login" className={LINK}>Log in</a>
          </nav>
          <p className="text-[14px] text-[#5B616B]">© 2026 EventFlow</p>
        </div>
      </footer>
    </div>
  )
}
