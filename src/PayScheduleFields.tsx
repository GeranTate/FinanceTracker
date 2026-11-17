import type { Dispatch, SetStateAction } from "react";
import type { PaySchedule, Settings } from "./types";
import { latestPayday, nextPayday } from "./lib/paySchedule";
import { addDays, dateLabel, today } from "./lib/savings";
export default function PayScheduleFields({
  schedule,
  setSchedule,
  settings,
}: {
  schedule: PaySchedule;
  setSchedule: Dispatch<SetStateAction<PaySchedule>>;
  settings: Settings;
}) {
  const now = today(settings.timezone);
  let last = "",
    next = "";
  try {
    last = latestPayday(now, schedule);
    next = nextPayday(now, schedule);
  } catch {
    /* An anchor date may be empty while editing. */
  }
  return (
    <>
      <div className="settings-section">
        <h3>When are you paid?</h3>
        <p>
          Ahead / behind compares your savings with the plan through your latest
          payday. Status stays steady between paydays; graph lines stay smooth.
        </p>
      </div>
      <label>
        Pay frequency
        <select
          value={schedule.cadence}
          onChange={(e) =>
            setSchedule((s) => ({
              ...s,
              cadence: e.target.value as PaySchedule["cadence"],
            }))
          }
        >
          <option value="daily">Daily comparison (no pay schedule)</option>
          <option value="weekly">Weekly</option>
          <option value="biweekly">Every two weeks</option>
          <option value="semimonthly">Twice a month</option>
          <option value="monthly">Monthly</option>
        </select>
      </label>
      {schedule.cadence === "weekly" && (
        <label>
          Paid on
          <select
            value={schedule.weekday}
            onChange={(e) =>
              setSchedule((s) => ({ ...s, weekday: Number(e.target.value) }))
            }
          >
            {[
              "Sunday",
              "Monday",
              "Tuesday",
              "Wednesday",
              "Thursday",
              "Friday",
              "Saturday",
            ].map((name, i) => (
              <option key={name} value={i}>
                {name}
              </option>
            ))}
          </select>
        </label>
      )}
      {schedule.cadence === "biweekly" && (
        <label>
          A known payday
          <input
            type="date"
            required
            min="2000-01-01"
            max={addDays(now, 36525)}
            value={schedule.anchor_date}
            onChange={(e) =>
              setSchedule((s) => ({ ...s, anchor_date: e.target.value }))
            }
          />
          <small>
            Choose one actual payday. Paydays repeat every 14 days before and
            after it.
          </small>
        </label>
      )}
      {(schedule.cadence === "monthly" ||
        schedule.cadence === "semimonthly") && (
        <div className="form-grid">
          <label>
            {schedule.cadence === "monthly"
              ? "Paid on day of month"
              : "First payday (day of month)"}
            <input
              required
              type="number"
              min="1"
              max="31"
              step="1"
              value={schedule.day1 || ""}
              onChange={(e) =>
                setSchedule((s) => ({ ...s, day1: Number(e.target.value) }))
              }
            />
          </label>
          {schedule.cadence === "semimonthly" && (
            <label>
              Second payday (day of month)
              <input
                required
                type="number"
                min={schedule.day1 + 1}
                max="31"
                step="1"
                value={schedule.day2 || ""}
                onChange={(e) =>
                  setSchedule((s) => ({ ...s, day2: Number(e.target.value) }))
                }
              />
            </label>
          )}
        </div>
      )}
      {schedule.cadence !== "daily" && (
        <p className="form-note">
          {last && next
            ? `Latest payday: ${dateLabel(last)}. Next payday: ${dateLabel(next)}.`
            : "Choose your pay dates."}{" "}
          Savings are due on payday itself. Shorter months use their last day;
          the final goal deadline always takes priority.
        </p>
      )}
    </>
  );
}
