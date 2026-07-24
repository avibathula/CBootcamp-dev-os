const FEATURES = [
  {
    title: 'Key-term extraction',
    body: 'Upload an NDA or MSA and get structured terms pulled out automatically — no legal background required.',
  },
  {
    title: 'Page-level confidence',
    body: 'Every extracted term links back to the exact page it came from, with a confidence score you can trust or verify.',
  },
  {
    title: 'Document-grounded Q&A',
    body: 'Ask questions about your contract and get answers sourced directly from the document, not a generic model.',
  },
]

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col bg-white px-6 py-12 sm:px-16 sm:py-24 lg:px-28">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-10">
        <section className="flex flex-col gap-6">
          <span className="text-body-sm uppercase tracking-wide text-text-secondary">
            ContractIQ
          </span>
          <h1 className="text-h3 sm:text-h1 text-text-primary">
            Understand your contract in minutes, not hours.
          </h1>
          <p className="max-w-2xl text-body-lg text-text-secondary">
            ContractIQ reviews NDAs and MSAs for you — extracting key terms with
            page references and confidence scores, so you never sign something
            you don&apos;t understand.
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <a
              href="/auth/signup"
              className="rounded-md bg-blue-500 px-8 py-3 text-body-lg font-semibold text-white transition-colors duration-fast hover:bg-blue-600"
            >
              Get started free
            </a>
            <a
              href="/auth/signin"
              className="text-body-lg font-medium text-text-primary underline-offset-4 hover:underline"
            >
              Sign in
            </a>
          </div>
        </section>

        <section className="flex flex-col gap-6">
          <h2 className="text-h5 text-text-primary">Built for people without a lawyer on call</h2>
          <div className="flex flex-wrap gap-4">
            {FEATURES.map((feature) => (
              <div
                key={feature.title}
                className="flex min-w-[240px] flex-1 flex-col gap-2 rounded-lg border border-grey-100 bg-bg-surface p-6"
              >
                <h3 className="text-body-lg text-text-primary">{feature.title}</h3>
                <p className="text-body-sm text-text-secondary">{feature.body}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  )
}
