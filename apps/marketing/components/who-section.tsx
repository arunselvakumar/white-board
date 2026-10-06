const institutes = [
  {
    name: "Computer centre",
    body: "DCA, Tally, CCC. Weekday Batches in a lab, 20 seats, a monthly Fee Plan, a Receipt before the Student leaves the desk.",
  },
  {
    name: "Home tuition",
    body: "One Student, Sunday 5 to 6. Student-specific Timings on the Enrollment, so the Batch clock does not apply.",
  },
  {
    name: "Skill centre",
    body: "Spoken English, tailoring, vocational courses. Short Courses with a one-time fee, Online or Hybrid Class Mode when the room is full.",
  },
] as const;

const comingSoon = [
  "School",
  "Preschool",
  "College",
  "University",
  "Other",
] as const;

export function WhoSection() {
  return (
    <section
      id="who"
      aria-labelledby="who-heading"
      className="bg-background scroll-mt-16 py-24 md:py-32 lg:py-40"
    >
      <div className="container-site grid gap-12 lg:grid-cols-12 lg:gap-10">
        <div className="lg:col-span-5">
          <h2 id="who-heading" className="text-section max-w-[14ch]">
            Made for the centre on the corner.
          </h2>
          <p className="text-muted-foreground mt-6 max-w-[42ch] text-xl leading-[1.5]">
            Whiteboard is built for the Training Institute: one room, a few
            Courses, Batches through the day, and an owner who also sits at the
            fee desk.
          </p>
        </div>

        <div className="lg:col-span-7">
          <ul className="border-border border-t">
            {institutes.map((item) => (
              <li
                key={item.name}
                className="border-border grid gap-2 border-b py-7 md:grid-cols-[11rem_1fr] md:gap-8"
              >
                <h3 className="text-xl font-semibold tracking-[-0.01em]">
                  {item.name}
                </h3>
                <p className="max-w-[60ch] text-[1.0625rem] leading-[1.6]">
                  {item.body}
                </p>
              </li>
            ))}
          </ul>

          <div className="mt-16 md:grid md:grid-cols-[11rem_1fr] md:gap-8">
            <h3 className="text-base font-semibold">Coming soon</h3>
            <div className="mt-2 md:mt-0">
              <p className="text-muted-foreground max-w-[60ch] text-[1.0625rem] leading-[1.6]">
                Training Institute is the only Institution Type a Workspace can
                choose today.
              </p>
              <ul className="border-border mt-5 border-t">
                {comingSoon.map((type) => (
                  <li
                    key={type}
                    className="border-border text-muted-foreground border-b py-3 text-[1.0625rem]"
                  >
                    {type}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
