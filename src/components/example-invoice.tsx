/**
 * An example of a finished invoice (2026-10-23): the first page of a real PDF made by UseHourly's own invoice code for
 * an invented freelancer (Okafor Design Studio) and client (Northwind Coffee), shown beside the forms that fill in an
 * invoice (Account > Business details, Clients > Billing details). A click opens the whole PDF. The numbers in it are
 * clearly fake. To remake it, see public/examples/README.md.
 */
export function ExampleInvoice() {
  return (
    <figure className="mx-auto w-full max-w-[22rem]">
      <a
        href="/examples/example-invoice.pdf"
        target="_blank"
        rel="noopener"
        title="Open the example invoice (PDF)"
        className="group block overflow-hidden rounded-md shadow-[0_18px_40px_-18px_rgb(0_0_0/0.6)] ring-1 ring-foreground/10 transition-transform hover:-translate-y-0.5 dark:brightness-[0.9]"
      >
        {/* biome-ignore lint/performance/noImgElement: a small static preview; next/image adds nothing here */}
        <img
          src="/examples/example-invoice.webp"
          alt="Example invoice INV-2026-014 from Okafor Design Studio to Northwind Coffee: four projects, 59.75 hours, $5,463.75"
          width={900}
          height={1165}
          className="block h-auto w-full"
        />
      </a>
      <figcaption className="mt-3 text-center text-foreground/70 text-sm">
        An example invoice.{" "}
        <a href="/examples/example-invoice.pdf" target="_blank" rel="noopener" className="underline underline-offset-4">
          Open the PDF
        </a>
        . Yours uses your details and your time.
      </figcaption>
    </figure>
  );
}
