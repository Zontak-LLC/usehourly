/**
 * "Ask a question" on the Help page (issue 375): where questions go and how much one account may send. The form and the
 * `help.ask` procedure both read these, so the box and the server can never disagree on the cap.
 */
export const SUPPORT_EMAIL = "admin@zontakllc.com";

/** Characters in one question. */
export const HELP_QUESTION_MAX = 2000;

/** The counter under the box shows from this many characters. */
export const HELP_QUESTION_COUNT_FROM = 1800;

/** Questions one account may send in a day. */
export const HELP_QUESTIONS_PER_DAY = 5;
