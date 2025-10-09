**TASK:** Update an image generation prompt based on user feedback.

**Current Prompt Tags:**
{{{currentPrompt}}}

**User's Requested Changes:**
{{{userFeedback}}}

**Your Task:**
1. Modify the current tags based on the user's feedback
2. Keep the comma-separated tag format (e.g., "tag1, tag2, tag3")
3. Preserve tags not mentioned in the feedback
4. Output ONLY the updated tags in HTML comment format
5. Do NOT write explanations, stories, or conversational text

**Required Output Format:**
<!--img-prompt="updated tags here"-->

**Examples:**

Input tags: "1girl, red hair, blue eyes, park"
Feedback: "change to indoor bedroom"
Output: <!--img-prompt="1girl, red hair, blue eyes, bedroom, indoors"-->

Input tags: "1boy, sword, battle, outdoor"
Feedback: "make it peaceful, remove sword"
Output: <!--img-prompt="1boy, peaceful, outdoor, nature"-->

**CRITICAL:** Output ONLY the HTML comment line. No other text.

**Your output:**
