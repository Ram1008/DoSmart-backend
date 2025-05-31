import fetch from "node-fetch";
import dotenv from "dotenv";
import { parseISO } from "date-fns";

dotenv.config();
export async function generateTaskFromText(textInput) {
  const nowISO = new Date().toISOString();
  const prompt = `
You are a task-parsing assistant.  
Current date and time (UTC): ${nowISO}  

When the user gives you a plain English sentence that describes a to-do—especially if it mentions a specific time (e.g. "Tomorrow at 6:00 PM", "next Monday at 10AM", "in two hours")—you MUST parse that into an ISO 8601 UTC timestamp and put it in "start_time".  
**Under no circumstances should "start_time" be null if a time is given in the input.**

Return exactly one JSON object (no extra text, no code fences) with these keys:

{
  "title": string,               
  "description": string|null,    
  "start_time": string,          
  "deadline": string,            // ISO 8601 UTC format, e.g. "2023-10-01T12:00:00Z"  
                                  //   If the input says "in one hour", interpret deadline = start_time + 1 hour.  
                                  //   If user explicitly provides both start and end time, use them.
  "status": string               // "Upcoming Task" if start_time > now, else "Ongoing Task" if now ≤ start_time < deadline.
}

**Important rules**:
1. If input contains a relative phrase like "in one hour" and **no specific start time**, set start_time = ${nowISO}, and deadline = now + 1 hour, then status = "Ongoing Task".
2. If input contains a specific future time (e.g. "Tomorrow at 6:00 PM"), convert that exact moment to UTC ISO and set start_time accordingly. Then deadline is start_time + the duration mentioned (e.g. "in one hour" or explicit end time). Status = "Upcoming Task".
3. If user mentions explicit both start and end (e.g. "From 5 PM to 7 PM, submit report tomorrow"), parse both times and set start_time and deadline exactly.
4. If user does NOT mention any time at all, then set start_time = ${nowISO}, deadline = null is not allowed—require at least "deadline". If truly no deadline mentioned, assume deadline = start_time + 1 hour.

Be very precise and return valid JSON only.
`;

  // 3) OpenAI API का request भेजें
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content:
            "You are a helpful assistant that extracts structured tasks.",
        },
        {
          role: "user",
          content: prompt + '\n\nUser Input: "' + textInput + '"',
        },
      ],
      temperature: 0.0,
      max_tokens: 200,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenAI API Error: ${response.status} ${errText}`);
  }

  const data = await response.json();
  console.log(`GPT Response:`, data);
  const raw = data.choices[0].message.content.trim();

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (jsonErr) {
    console.error("Failed to parse GPT response:", raw);
    throw new Error("Invalid JSON from GPT");
  }

  if (parsed.start_time) {
    parsed.start_time = new Date(parsed.start_time).toISOString();
  } else {
    parsed.start_time = null;
  }
  parsed.deadline = new Date(parsed.deadline).toISOString();

  const now = new Date(nowISO);
  if (!parsed.start_time) {
    parsed.status = "Ongoing Task";
  } else {
    const start = parseISO(parsed.start_time);
    const dl = parseISO(parsed.deadline);
    if (start > now) {
      parsed.status = "Upcoming Task";
    } else {
      parsed.status = dl > now ? "Ongoing Task" : "Failed Task";
    }
  }

  return parsed;
}
