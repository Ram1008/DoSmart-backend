import fetch from 'node-fetch'; // Node v18+ में यह बिल्ट-इन होता है, वरना “npm install node-fetch” करें
import dotenv from 'dotenv';
import { parseISO, formatISO } from 'date-fns';

dotenv.config();

/**
 * OpenAI GPT API कॉल करके plain-text से हमारा Task-schema वाला JSON बनाए।
 * Prompt में "current date/time" भी शामिल किया गया है ताकि GPT संदर्भ के लिए जान सके कि अभी कब है।
 *
 * @param {string} textInput - यूज़र का फ़्री-टेक्स्ट (e.g. "Tomorrow I have to clean my room in one hour")
 * @returns {Promise<{ title: string, description: string|null, start_time: string|null, deadline: string, status: string }>}
 */
export async function generateTaskFromText(textInput) {
    const nowISO = new Date().toISOString();

  // 2) Updated Prompt तैयार करें
  const prompt = `
You are a task-parsing assistant.  
Current date and time (UTC): ${nowISO}  

When the user gives you a plain English sentence that describes a to-do—especially if it mentions a specific time (e.g. "Tomorrow at 6:00 PM", "next Monday at 10AM", "in two hours")—you MUST parse that into an ISO 8601 UTC timestamp and put it in "start_time".  
**Under no circumstances should "start_time" be null if a time is given in the input.**

Return exactly one JSON object (no extra text, no code fences) with these keys:

{
  "title": string,               
  "description": string|null,    
  "start_time": string,          // ISO 8601 टाइमस्टैम्प (UTC). Must not be null if input mentions any time.
  "deadline": string,            // ISO 8601 टाइमस्टैम्प (UTC).  
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
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: 'You are a helpful assistant that extracts structured tasks.' },
        { role: 'user', content: prompt + '\n\nUser Input: "' + textInput + '"' }
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
  // GPT-3.5-turbo से सबसे पहला choice लें
  const raw = data.choices[0].message.content.trim();

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (jsonErr) {
    // अगर JSON parse न हो, तो पूरा response debug के लिए देखें
    console.error('Failed to parse GPT response:', raw);
    throw new Error('Invalid JSON from GPT');
  }

  // 4) Timestamp normalization / validation
  if (parsed.start_time) {
    parsed.start_time = new Date(parsed.start_time).toISOString();
  } else {
    parsed.start_time = null;
  }
  parsed.deadline = new Date(parsed.deadline).toISOString();

  // 5) Status फेर से चेक करें, अगर GPT ने गलती से नहीं दिया हो
  const now = new Date(nowISO);
  if (!parsed.start_time) {
    parsed.status = 'Ongoing Task';
  } else {
    const start = parseISO(parsed.start_time);
    const dl = parseISO(parsed.deadline);
    if (start > now) {
      parsed.status = 'Upcoming Task';
    } else {
      parsed.status = dl > now ? 'Ongoing Task' : 'Failed Task';
    }
  }

  return parsed;
}
