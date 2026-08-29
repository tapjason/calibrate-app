import type { WarmupQuestion } from '@/types';

/**
 * The Warmup question bank.
 *
 * Chosen for a specific job, not for trivia value: the mix has to make an
 * overconfident user *visibly* overconfident inside ten questions. So it runs
 * from near-certain (Pacific / Sahara) through genuinely close calls (hand vs.
 * foot bones) to items where the obvious answer is wrong (blue whale vs. 737,
 * ballpoint pen vs. microwave). Someone who slides to 95% on all ten lands
 * around 70% accuracy — which is the whole point of the exercise.
 *
 * Every item is a two-way choice, which is what makes 50% the honest floor of
 * the confidence slider: a coin flip already gets you there.
 */
export const WARMUP_QUESTIONS: readonly WarmupQuestion[] = [
  {
    id: 'whale-737',
    prompt: 'Which is longer?',
    options: ['A blue whale', 'A Boeing 737'],
    correctIndex: 1,
    fact: 'A 737 runs about 40m; even a large blue whale tops out near 30m.',
  },
  {
    id: 'pen-microwave',
    prompt: 'Which was invented first?',
    options: ['The ballpoint pen', 'The microwave oven'],
    correctIndex: 0,
    fact: 'The modern ballpoint arrived in 1938, the microwave oven in 1946.',
  },
  {
    id: 'crust-metal',
    prompt: "Which is more abundant in Earth's crust?",
    options: ['Aluminium', 'Iron'],
    correctIndex: 0,
    fact: 'Aluminium is roughly 8% of the crust by mass; iron is closer to 5%.',
  },
  {
    id: 'hand-foot-bones',
    prompt: 'Which has more bones?',
    options: ['One adult hand', 'One adult foot'],
    correctIndex: 0,
    fact: 'A hand has 27 bones, a foot 26 — closer than most people guess.',
  },
  {
    id: 'ocean-depth',
    prompt: 'Which ocean is deeper at its deepest point?',
    options: ['The Atlantic', 'The Pacific'],
    correctIndex: 1,
    fact: 'The Pacific holds the Mariana Trench at nearly 11km.',
  },
  {
    id: 'india-argentina',
    prompt: 'Which country covers more land?',
    options: ['India', 'Argentina'],
    correctIndex: 0,
    fact: 'India is about 3.3M km²; Argentina about 2.8M km².',
  },
  {
    id: 'oxford-tenochtitlan',
    prompt: 'Which came first?',
    options: ['Teaching at Oxford', 'The founding of Tenochtitlan'],
    correctIndex: 0,
    fact: 'Oxford was teaching by 1096; Tenochtitlan was founded in 1325.',
  },
  {
    id: 'milk-water',
    prompt: 'Which weighs more?',
    options: ['A gallon of water', 'A gallon of milk'],
    correctIndex: 1,
    fact: 'Milk is slightly denser than water, so it wins by a few percent.',
  },
  {
    id: 'venus-mars',
    prompt: 'Which is closer to Earth on average?',
    options: ['Venus', 'Mars'],
    correctIndex: 0,
    fact: 'Venus averages about 1.1 AU from Earth; Mars about 1.7 AU.',
  },
  {
    id: 'sahara-antarctica',
    prompt: 'Which desert is larger?',
    options: ['The Sahara', 'Antarctica'],
    correctIndex: 1,
    fact: 'Antarctica is a desert — and at 14M km², the largest one.',
  },
];
