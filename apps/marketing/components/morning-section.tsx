const MORNING_POINTS = [
  {
    name: "Calendar",
    body: "Every Class from the weekly Timings, with Cancelled Classes, Moved Classes, and Holidays applied. Day, week, and month.",
  },
  {
    name: "Student Home and Parent Home",
    body: "A Student with an email sees their next Class, remaining dues, and Class recordings. A parent sees every Student they are linked to, on one page.",
  },
  {
    name: "Online classes",
    body: "An Online or Hybrid Batch joins through a Whiteboard-hosted class that records itself, or through your own meeting link.",
  },
] as const;

const TODAYS_BATCHES = [
  {
    name: "DCA Weekday",
    time: "9:00 to 11:00",
    where: "Lab 1",
    seats: "14 of 20",
  },
  {
    name: "Spoken English",
    time: "4:00 to 5:00",
    where: "Online",
    online: true,
    seats: "9 of 12",
  },
  {
    name: "Python",
    time: "5:00 to 6:00",
    where: "Home tuition",
    seats: "1 of 1",
  },
  {
    name: "Tally Evening",
    time: "6:00 to 8:00",
    where: "Lab 2",
    seats: "11 of 15",
  },
] as const;

const RECENT_STUDENTS = [
  { name: "Priya Nair", course: "DCA" },
  { name: "Arjun Mehta", course: "Tally" },
  { name: "Fathima K", course: "Spoken English" },
] as const;

function OwnerDashboardMock() {
  return (
    <div
      aria-hidden="true"
      className="bg-card text-card-foreground border-border @container w-full max-w-[560px] overflow-hidden rounded-xl border"
    >
      <div className="bg-secondary border-border flex items-baseline justify-between gap-3 border-b px-5 py-3 sm:px-6">
        <span className="text-[0.9375rem] font-semibold">Owner Dashboard</span>
        <span className="text-muted-foreground font-mono text-[0.75rem]">
          Tuesday, 6 October
        </span>
      </div>

      <dl className="border-border grid grid-cols-[1fr_1.35fr_1fr] border-b">
        <Figure value="38" label="active Students" />
        <Figure value="₹46,500" label="outstanding dues" due />
        <Figure value="4" label="Batches today" />
      </dl>

      <div className="px-5 pt-5 sm:px-6">
        <p className="text-[0.875rem] font-semibold">Today&apos;s Batches</p>
        <ul className="border-border mt-2 border-t">
          {TODAYS_BATCHES.map((batch) => (
            <li
              key={batch.name}
              className="border-border grid grid-cols-[1fr_auto] items-baseline gap-x-4 border-b py-2.5 text-[0.8125rem] @md:grid-cols-[1fr_7rem_4.5rem]"
            >
              <span>
                <span className="font-semibold">{batch.name}</span>
                <span className="text-muted-foreground">, </span>
                <span className="text-muted-foreground font-mono text-[0.75rem]">
                  {batch.time}
                </span>
              </span>
              <span className="text-muted-foreground col-start-1 row-start-2 flex items-center gap-1.5 @md:col-start-auto @md:row-start-auto">
                {"online" in batch ? (
                  <span className="size-1.5 shrink-0 rounded-full bg-[#2a7dbf]" />
                ) : null}
                {batch.where}
              </span>
              <span className="col-start-2 row-span-2 row-start-1 text-right font-mono text-[0.75rem] @md:col-start-auto @md:row-span-1 @md:row-start-auto">
                {batch.seats}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="px-5 pt-6 pb-5 sm:px-6">
        <p className="text-[0.875rem] font-semibold">Recent Students</p>
        <ul className="border-border mt-2 border-t">
          {RECENT_STUDENTS.map((student) => (
            <li
              key={student.name}
              className="border-border flex items-baseline justify-between gap-4 border-b py-2.5 text-[0.8125rem] last:border-b-0"
            >
              <span className="font-semibold">{student.name}</span>
              <span className="text-muted-foreground">{student.course}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Figure({
  value,
  label,
  due = false,
}: {
  value: string;
  label: string;
  due?: boolean;
}) {
  return (
    <div className="border-border flex flex-col-reverse border-l px-4 py-4 first:border-l-0 sm:px-6 sm:py-5">
      <dt className="text-muted-foreground mt-1 flex items-center gap-1.5 text-[0.75rem] leading-tight @md:text-[0.8125rem]">
        {due ? (
          <span className="size-1.5 shrink-0 rounded-full bg-[#c7900a]" />
        ) : null}
        {label}
      </dt>
      <dd className="text-[clamp(1.25rem,6.5cqi,2.5rem)] leading-none font-light tracking-[-0.02em]">
        {value}
      </dd>
    </div>
  );
}

export function MorningSection() {
  return (
    <section
      id="morning"
      aria-labelledby="morning-heading"
      className="bg-background text-foreground scroll-mt-16 py-24 md:py-32 lg:py-40"
    >
      <div className="container-site grid items-center gap-16 lg:grid-cols-12 lg:gap-10">
        <div className="lg:order-2 lg:col-span-5">
          <h2 id="morning-heading" className="text-section max-w-[14ch]">
            Run the morning from one screen.
          </h2>
          <p className="text-muted-foreground mt-6 max-w-[60ch] text-[1.25rem] leading-[1.5]">
            The Owner Dashboard is where the day starts.
          </p>

          <dl className="border-border mt-10 max-w-[60ch] border-t">
            {MORNING_POINTS.map((point) => (
              <div key={point.name} className="border-border border-b py-5">
                <dt className="text-[1.0625rem] font-semibold">{point.name}</dt>
                <dd className="text-muted-foreground mt-1 text-[1.0625rem] leading-[1.6]">
                  {point.body}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="lg:order-1 lg:col-span-7">
          <p className="sr-only">
            A sample Owner Dashboard: 38 active Students, ₹46,500 outstanding
            dues, and four Batches today, with the Students who joined most
            recently.
          </p>
          <OwnerDashboardMock />
        </div>
      </div>
    </section>
  );
}
