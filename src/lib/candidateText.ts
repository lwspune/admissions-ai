// The words on every candidate screen, in English and Hindi (2026-10-11).
// The Hindi is offered only on a paper whose maths and science questions all
// have a Hindi version; English stays the default. Plain data, so a missing
// or untranslated entry is caught by a test, not by a candidate.
//
// A pair or triple of strings is a sentence with a styled value between its
// parts: ['This test is for ', ', who should answer…'] around the name.

import type { Lang } from './hindi'
import type { Subject } from './types'

/** Each language's name, written in that language, for the switch. */
export const LANG_LABEL: Record<Lang, string> = { en: 'English', hi: 'हिंदी' }

export interface CandidateText {
  /** The switch's accessible name. */
  language: string
  step: (n: number, of: number) => string
  identity: {
    title: string
    lead: string
    label: string
    placeholder: string
    submit: string
    checking: string
    mismatch: string
    locked: string
    offline: string
  }
  instructions: {
    title: string
    forName: [string, string]
    stats: { questions: string; minutes: string; closes: string }
    start: string
    starting: string
    startFailed: string
  }
  rules: {
    paper: (questions: number, minutes: number) => string
    syllabus: (classLevel: number) => string
    marking: string
    change: string
    leave: [string, string]
    timer: string
  }
  subject: Record<Subject, string>
  part: { basics: string; syllabus: (classLevel: number) => string }
  /** The printed question paper of a paper test (2026-10-16). */
  paper: {
    title: string
    name: string
    admission: (classLevel: number) => string
    date: string
    paperNo: string
    answerSheet: string
    marking: string
    numericBox: (position: number) => string
  }
  running: {
    question: [string, string, string]
    paused: string
    previous: string
    next: string
    review: string
    navLabel: string
    chooseOne: string
    typeNumber: string
    englishStays: string
  }
  palette: {
    title: string
    answered: [string, string, string]
    label: string
    current: string
    answeredKey: string
    notAnswered: string
    button: (position: number, done: boolean) => string
  }
  review: {
    title: string
    answered: string
    notAnswered: string
    all: string
    unanswered: (count: number) => string
    goTo: (position: number) => string
    keepWorking: string
    submit: string
  }
  done: { title: string; body: string }
  announce: { minutes: (m: number) => string; seconds: (s: number) => string }
}

const en: CandidateText = {
  language: 'Language',
  step: (n, of) => `Step ${n} of ${of}`,
  identity: {
    title: 'Confirm your number',
    lead: 'Enter the mobile number this link was sent to.',
    label: 'Mobile number',
    placeholder: '10-digit mobile number',
    submit: 'Continue',
    checking: 'Checking…',
    mismatch: 'That number does not match this link.',
    locked: 'Too many attempts. Please contact the institute for a new link.',
    offline: 'Could not reach the server. Please check your connection and try again.',
  },
  instructions: {
    title: 'How the test works',
    forName: ['This test is for ', ', who should answer it on their own.'],
    stats: { questions: 'questions', minutes: 'minutes', closes: 'link closes' },
    start: 'Start the test',
    starting: 'Starting…',
    startFailed: 'Could not start the test.',
  },
  rules: {
    paper: (q, m) => `${q} questions — maths, English and science — in ${m} minutes.`,
    syllabus: (c) =>
      `Some maths and science questions are from the Class ${c} syllabus; each question is marked either Basics or Class ${c}.`,
    marking:
      'One mark for a correct answer. A quarter mark is deducted for a wrong multiple-choice answer; there is no penalty on the type-in questions, or for leaving one blank.',
    change: 'You can go back and change any answer before submitting.',
    leave: ['If you leave this page the timer pauses, but this link stops working at ', ' whatever happens.'],
    timer: 'The timer starts when you press Start, not now.',
  },
  subject: { maths: 'Maths', english: 'English', science: 'Science' },
  part: { basics: 'Basics', syllabus: (c) => `Class ${c}` },
  paper: {
    title: 'Question paper',
    name: 'Name',
    admission: (c) => `Admission to Class ${c}`,
    date: 'Date',
    paperNo: 'Paper No',
    answerSheet: 'Mark every answer on the OMR answer sheet, not on this paper.',
    marking:
      'One mark for a correct answer. A quarter mark is deducted for a wrong multiple-choice answer; there is no penalty on the numeric questions, or for leaving one blank.',
    numericBox: (q) => `Write the answer in box Q${q} on the answer sheet.`,
  },
  running: {
    question: ['Question ', ' of ', ''],
    paused: 'Timer paused.',
    previous: 'Previous',
    next: 'Next',
    review: 'Review & submit',
    navLabel: 'Previous and next question',
    chooseOne: 'Choose one answer',
    typeNumber: 'Type your answer as a number',
    englishStays: 'English questions stay in English.',
  },
  palette: {
    title: 'All questions',
    answered: ['', ' of ', ' answered'],
    label: 'Questions',
    current: 'Current',
    answeredKey: 'Answered',
    notAnswered: 'Not answered',
    button: (p, done) => `Question ${p}, ${done ? 'answered' : 'not answered'}`,
  },
  review: {
    title: 'Ready to submit?',
    answered: 'answered',
    notAnswered: 'not answered',
    all: 'You have answered every question.',
    unanswered: (n) =>
      `${n} question${n === 1 ? '' : 's'} not answered. Blank answers score zero, but there is no penalty for them.`,
    goTo: (p) => `Go to ${p}`,
    keepWorking: 'Keep working',
    submit: 'Submit',
  },
  done: { title: 'Thank you', body: 'Your answers have been received. The institute will be in touch.' },
  announce: {
    minutes: (m) => `${m} minutes remaining`,
    seconds: (s) => `${s} seconds remaining`,
  },
}

const hi: CandidateText = {
  language: 'भाषा',
  step: (n, of) => `चरण ${n} / ${of}`,
  identity: {
    title: 'अपने नंबर की पुष्टि करें',
    lead: 'वह मोबाइल नंबर लिखिए जिस पर यह लिंक भेजा गया था।',
    label: 'मोबाइल नंबर',
    placeholder: '10 अंकों का मोबाइल नंबर',
    submit: 'आगे बढ़ें',
    checking: 'जाँच हो रही है…',
    mismatch: 'यह नंबर इस लिंक से मेल नहीं खाता।',
    locked: 'बहुत बार कोशिश हो चुकी है। नए लिंक के लिए कृपया संस्थान से संपर्क करें।',
    offline: 'सर्वर से संपर्क नहीं हो सका। कृपया इंटरनेट कनेक्शन जाँचकर फिर कोशिश करें।',
  },
  instructions: {
    title: 'टेस्ट कैसे होगा',
    forName: ['यह टेस्ट ', ' के लिए है, जिन्हें इसे ख़ुद हल करना है।'],
    stats: { questions: 'प्रश्न', minutes: 'मिनट', closes: 'लिंक बंद होगा' },
    start: 'टेस्ट शुरू करें',
    starting: 'शुरू हो रहा है…',
    startFailed: 'टेस्ट शुरू नहीं हो सका।',
  },
  rules: {
    paper: (q, m) => `${m} मिनट में ${q} प्रश्न — गणित, अंग्रेज़ी और विज्ञान।`,
    syllabus: (c) =>
      `गणित और विज्ञान के कुछ प्रश्न कक्षा ${c} के पाठ्यक्रम से हैं; हर प्रश्न पर "बुनियादी" या "कक्षा ${c}" लिखा है।`,
    marking:
      'सही उत्तर पर एक अंक। बहुविकल्पीय प्रश्न के गलत उत्तर पर चौथाई अंक कटेगा; संख्या लिखने वाले प्रश्नों में, या कोई प्रश्न छोड़ने पर, कोई अंक नहीं कटेगा।',
    change: 'जमा करने से पहले आप किसी भी उत्तर पर वापस जाकर उसे बदल सकते हैं।',
    leave: ['यह पेज छोड़ने पर टाइमर रुक जाता है, पर यह लिंक ', ' पर हर हाल में बंद हो जाएगा।'],
    timer: 'टाइमर "टेस्ट शुरू करें" दबाने पर शुरू होगा, अभी नहीं।',
  },
  subject: { maths: 'गणित', english: 'अंग्रेज़ी', science: 'विज्ञान' },
  part: { basics: 'बुनियादी', syllabus: (c) => `कक्षा ${c}` },
  paper: {
    title: 'प्रश्न पत्र',
    name: 'नाम',
    admission: (c) => `कक्षा ${c} में प्रवेश`,
    date: 'दिनांक',
    paperNo: 'प्रश्न पत्र संख्या',
    answerSheet: 'सभी उत्तर OMR उत्तर पत्रक पर अंकित करें, इस प्रश्न पत्र पर नहीं।',
    marking:
      'सही उत्तर पर एक अंक। बहुविकल्पीय प्रश्न के गलत उत्तर पर चौथाई अंक कटेगा; संख्या लिखने वाले प्रश्नों में, या कोई प्रश्न छोड़ने पर, कोई अंक नहीं कटेगा।',
    numericBox: (q) => `इसका उत्तर उत्तर पत्रक पर बॉक्स Q${q} में लिखें।`,
  },
  running: {
    question: ['प्रश्न ', ' / ', ''],
    paused: 'टाइमर रुका हुआ है।',
    previous: 'पिछला',
    next: 'अगला',
    review: 'जाँचें और जमा करें',
    navLabel: 'पिछला और अगला प्रश्न',
    chooseOne: 'एक उत्तर चुनें',
    typeNumber: 'अपना उत्तर संख्या में लिखिए',
    englishStays: 'अंग्रेज़ी के प्रश्न अंग्रेज़ी में ही हैं।',
  },
  palette: {
    title: 'सभी प्रश्न',
    answered: ['उत्तर दिए: ', ' / ', ''],
    label: 'प्रश्न',
    current: 'मौजूदा',
    answeredKey: 'उत्तर दिया',
    notAnswered: 'उत्तर नहीं दिया',
    button: (p, done) => `प्रश्न ${p}, ${done ? 'उत्तर दिया' : 'उत्तर नहीं दिया'}`,
  },
  review: {
    title: 'जमा करने के लिए तैयार हैं?',
    answered: 'उत्तर दिए',
    notAnswered: 'उत्तर नहीं दिए',
    all: 'आपने हर प्रश्न का उत्तर दे दिया है।',
    unanswered: (n) =>
      `${n} ${n === 1 ? 'प्रश्न का' : 'प्रश्नों के'} उत्तर नहीं दिए गए। खाली उत्तर पर शून्य अंक मिलता है, पर कोई अंक कटता नहीं।`,
    goTo: (p) => `प्रश्न ${p} पर जाएँ`,
    keepWorking: 'जारी रखें',
    submit: 'जमा करें',
  },
  done: { title: 'धन्यवाद', body: 'आपके उत्तर मिल गए हैं। संस्थान आपसे संपर्क करेगा।' },
  announce: {
    minutes: (m) => `${m} मिनट बाकी`,
    seconds: (s) => `${s} सेकंड बाकी`,
  },
}

export const CANDIDATE_TEXT: Record<Lang, CandidateText> = { en, hi }

export type NoticeStatus = 'not_found' | 'expired' | 'too_late' | 'submitted'

/**
 * The dead ends, shown in both languages at once: they come before the paper
 * is known, and a parent often reads them while the child waits.
 */
export const NOTICE_TEXT: Record<NoticeStatus, Record<Lang, { title: string; body: string }>> = {
  not_found: {
    en: {
      title: 'This link is not available',
      body: 'It may have been replaced by a newer link. Please check the most recent message from the institute, or ask them to send a fresh one.',
    },
    hi: {
      title: 'यह लिंक उपलब्ध नहीं है',
      body: 'हो सकता है इसकी जगह नया लिंक भेजा गया हो। कृपया संस्थान का सबसे नया संदेश देखें, या उनसे नया लिंक भेजने को कहें।',
    },
  },
  expired: {
    en: {
      title: 'This link has expired',
      body: 'Links stay open for three hours. Please contact the institute and they will send a new one.',
    },
    hi: {
      title: 'इस लिंक का समय समाप्त हो गया है',
      body: 'लिंक तीन घंटे तक खुले रहते हैं। कृपया संस्थान से संपर्क करें, वे नया लिंक भेज देंगे।',
    },
  },
  too_late: {
    en: {
      title: 'Not enough time left',
      body: 'The test needs its full time without interruption, and this link is close to expiring. Please ask the institute for a fresh link.',
    },
    hi: {
      title: 'पर्याप्त समय नहीं बचा',
      body: 'टेस्ट के लिए बिना रुकावट पूरा समय चाहिए, और यह लिंक बंद होने वाला है। कृपया संस्थान से नया लिंक माँगें।',
    },
  },
  submitted: {
    en: {
      title: 'This test has already been completed',
      body: 'Thank you — we have the answers. The institute will be in touch.',
    },
    hi: {
      title: 'यह टेस्ट पहले ही पूरा हो चुका है',
      body: 'धन्यवाद — हमें उत्तर मिल गए हैं। संस्थान आपसे संपर्क करेगा।',
    },
  },
}
