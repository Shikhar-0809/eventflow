import { useEffect } from 'react'
import { ArrowLeft, CalendarDays } from 'lucide-react'

export const PRIVACY_POLICY_PATH = '/privacy'
const LAST_UPDATED = '15 October 2026'

const CONTACT_EMAIL = 'eventflow.support@gmail.com'

const ContactEmail = () => (
  <a
    href={`mailto:${CONTACT_EMAIL}`}
    className="font-medium text-teal-600 hover:text-teal-700 underline transition-all duration-200"
  >
    {CONTACT_EMAIL}
  </a>
)

const Section = ({ id, title, children }) => (
  <section aria-labelledby={id} className="mt-8">
    <h2 id={id} className="text-lg font-semibold text-slate-900 mb-2">{title}</h2>
    <div className="space-y-3 text-slate-700 leading-relaxed">{children}</div>
  </section>
)

const List = ({ items }) => (
  <ul className="list-disc pl-5 space-y-1.5">
    {items.map((item) => <li key={item}>{item}</li>)}
  </ul>
)

export const PrivacyPolicyPage = () => {
  useEffect(() => {
    document.title = 'Privacy Policy — EventFlow'
  }, [])

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="max-w-3xl mx-auto">
        <a
          href="/"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-teal-600 hover:text-teal-700 transition-all duration-200 mb-4"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          Back to sign in
        </a>

        <main className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 sm:p-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="bg-teal-600 rounded-xl p-2">
              <CalendarDays className="w-6 h-6 text-white" aria-hidden="true" />
            </div>
            <h1 className="text-2xl font-semibold text-slate-900">Privacy Policy</h1>
          </div>
          <p className="text-sm text-slate-500">Last updated: {LAST_UPDATED}</p>

          <p className="mt-6 text-slate-700 leading-relaxed">
            EventFlow is a booking and inventory tool for small tent and catering businesses in India.
            This page explains, in plain words, what information the service keeps, why, where it is
            kept, and what you can ask us to do with it.
          </p>

          <Section id="who" title="1. About this policy">
            <p>
              This policy explains how EventFlow handles data. If you have questions or requests about
              your data, contact us at <ContactEmail />.
            </p>
          </Section>

          <Section id="roles" title="2. Whose data is whose">
            <p>
              Under India&apos;s Digital Personal Data Protection Act, 2023 (DPDP Act), the business that
              uses EventFlow (the &quot;merchant&quot;) decides why and how its own clients&apos; details are
              used. So each merchant is the <strong>data fiduciary</strong> for the client information it
              enters, and EventFlow only stores and processes that information on the merchant&apos;s
              behalf, to run the service.
            </p>
            <p>
              For the merchant&apos;s own account details and usage records (sections 3.1 and 3.4), we decide
              how they are used, so we are responsible for them ourselves.
            </p>
          </Section>

          <Section id="collect" title="3. What we collect">
            <h3 className="font-semibold text-slate-800">3.1 Merchant account</h3>
            <p>When a business signs up, we store:</p>
            <List
              items={[
                'the business name',
                'the email address used to log in',
                'the password, kept only as a one-way scrambled value (a hash) from which the password cannot be read back',
                'the date the account was created',
              ]}
            />

            <h3 className="font-semibold text-slate-800 pt-2">3.2 Client and booking details entered by the merchant</h3>
            <p>Merchants type these into the app. We store what they enter:</p>
            <List
              items={[
                'client name and phone number',
                'event type (including any custom description), event date, guest count and venue',
                'amounts: advance, total, discount, and the balance worked out from them',
                'booking status (confirmed, pending, cancelled or completed)',
                'free-text notes on a booking, and the change-log notes the merchant adds',
                'expenses the merchant records against a booking (a label and an amount)',
                'which inventory items, and how many, are attached to a booking',
              ]}
            />
            <p>
              Notes are free text, so they contain whatever the merchant chooses to type. Merchants should
              not put sensitive personal details in them.
            </p>

            <h3 className="font-semibold text-slate-800 pt-2">3.3 Inventory and settings</h3>
            <List
              items={[
                'item names, total and damaged quantities, and rental prices',
                'damage and repair notes',
                'business settings such as a monthly revenue target',
              ]}
            />

            <h3 className="font-semibold text-slate-800 pt-2">3.4 Usage records</h3>
            <p>
              We keep a simple activity log for each merchant account: which merchant, what kind of action,
              and when. The actions logged are logging in, opening a booking, creating or editing a booking,
              changing a booking&apos;s status, adding a change note, and using the buttons that prepare a WhatsApp
              confirmation or payment reminder. When an action relates to a booking, the log holds only that
              booking&apos;s ID number. It never holds a client&apos;s name, phone number or any other booking detail.
            </p>

            <h3 className="font-semibold text-slate-800 pt-2">3.5 Technical information</h3>
            <p>
              Like any web service, our servers see the network address (IP address) of each request. We use
              it briefly, in the server&apos;s memory, to slow down repeated login attempts, and we do not save it
              in the EventFlow database. Our hosting providers (section 7) may keep their own standard technical
              logs under their own policies.
            </p>
          </Section>

          <Section id="not-collected" title="4. What we do not collect">
            <List
              items={[
                'payment card, UPI or bank account details (payments are not handled in EventFlow)',
                'identity documents or biometric data',
                'client email addresses or home addresses',
                'advertising or tracking data: EventFlow has no advertising trackers, and no third-party analytics scripts',
              ]}
            />
          </Section>

          <Section id="purpose" title="5. Why we use it">
            <p>
              We use the information only to run the merchant&apos;s booking and inventory operations (the
              calendar, bookings, inventory, balances, records and reports), to show the merchant summaries of
              their own business and activity, to keep accounts secure, and to understand whether the service
              is working. We do not sell data, we do not use it for advertising, and we do not share it with
              anyone other than the providers that host the service (section 7).
            </p>
            <p>
              When a merchant taps a WhatsApp button, the app opens WhatsApp on their own device with a
              ready-written message. EventFlow does not send the message; WhatsApp&apos;s own terms apply to it.
              Excel files and printed or PDF reports are created on the merchant&apos;s device, and what happens to
              them afterwards is up to the merchant.
            </p>
          </Section>

          <Section id="storage" title="6. Who can see the data">
            <p>
              Each merchant can see only their own data. The data of different merchants is kept in the same
              database, and the service is built so that every request is limited to the logged-in
              merchant&apos;s records. The person who runs EventFlow can technically access the database in order to
              maintain the service, and will look at a merchant&apos;s data only when that merchant asks for help.
            </p>
          </Section>

          <Section id="hosting" title="7. Where the data is kept">
            <p>EventFlow runs on these cloud providers:</p>
            <List
              items={[
                'Vercel serves the web app and passes requests on to our server',
                'Render runs the EventFlow server (the API)',
                'Neon hosts the Postgres database where the data in section 3 is stored',
              ]}
            />
          </Section>

          <Section id="cookies" title="8. Cookies">
            <p>
              EventFlow sets one cookie: a session cookie that keeps you logged in. It is used for nothing
              else, it cannot be read by scripts on the page (it is marked <em>httpOnly</em>), it expires
              after 7 days, and it is removed when you log out. It holds an account number inside a signed
              token and no personal details. We use no advertising or analytics cookies, and the app does not
              store anything else in your browser.
            </p>
          </Section>

          <Section id="security" title="9. How we protect it">
            <List
              items={[
                'passwords are stored only as one-way hashes',
                'connections to the app and to the database are encrypted',
                'every request is checked against the logged-in merchant, so one merchant cannot see or change another merchant’s records',
                'repeated login and sign-up attempts are slowed down to make guessing passwords harder',
              ]}
            />
            <p>
              No system is perfectly secure. Please choose a strong password that you do not use elsewhere,
              and keep it private.
            </p>
          </Section>

          <Section id="retention" title="10. How long we keep it, and getting your data out">
            <List
              items={[
                'Bookings are kept after the event on purpose, so a merchant has a history to look back on. There is no automatic deletion.',
                'A merchant can delete a booking, an expense or an inventory item inside the app. Deleting a booking also deletes its change-log notes, expenses and inventory lines.',
                'A merchant can download their records as an Excel file from the Records screen.',
                'Deleting a whole account, and a complete export of an account’s data, are available on request. Write to us at the contact address above.',
                'Safety copies of the database made before software updates are kept for a few days.',
              ]}
            />
          </Section>

          <Section id="rights" title="11. Your rights and how to complain">
            <p>Under the DPDP Act you can ask to:</p>
            <List
              items={[
                'see what personal data we hold about you',
                'have wrong or incomplete data corrected',
                'have your data erased',
                'raise a grievance about how your data is handled',
              ]}
            />
            <p>
              Write to <ContactEmail /> for any of these. If you are a merchant&apos;s client
              and your details were entered by that merchant, the merchant is responsible for them (section 2).
              Please contact the merchant first, and we will help the merchant respond. If a grievance is not
              resolved, you may complain to the Data Protection Board of India.
            </p>
          </Section>

          <Section id="google" title="12. Sign in with Google (not available yet)">
            <p>
              This section applies only once &quot;Sign in with Google&quot; is launched. If you choose it, we receive
              your name, email address and Google profile ID from Google. We use them only to log you in and to
              match you to your EventFlow account.
            </p>
          </Section>

          <Section id="children" title="13. Children">
            <p>
              EventFlow is a tool for businesses and is not meant for anyone under 18. We do not knowingly
              create accounts for children.
            </p>
          </Section>

          <Section id="changes" title="14. Changes to this policy">
            <p>
              We will update this page when the way EventFlow handles data changes, and change the
              &quot;Last updated&quot; date at the top.
            </p>
          </Section>
        </main>

        <p className="text-center text-xs text-slate-400 mt-4">EventFlow</p>
      </div>
    </div>
  )
}
