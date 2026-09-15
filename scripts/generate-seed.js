#!/usr/bin/env node
/* ==========================================================================
   BookHaven — Book seed data generator
   Generates 500+ books per category with realistic titles, authors, and data.
   Outputs scripts/seed-data.json for server.js to consume on first run.
   ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');

/* ---------- Configuration ---------- */
const BOOKS_PER_CATEGORY = 520;

const CATEGORIES = {
  'Fiction': {
    subcategories: ['Mystery, Thriller & Suspense', 'Fantasy', 'Science Fiction', 'Historical Fiction', 'Literary Fiction', 'Adventure', 'Horror', 'Magical Realism'],
    authors: [
      'Agatha Christie', 'Arthur Conan Doyle', 'Tana French', 'Gillian Flynn', 'Paula Hawkins',
      'Stieg Larsson', 'Lee Child', 'John Grisham', 'Dan Brown', 'James Patterson',
      'Tolkien', 'George R.R. Martin', 'J.K. Rowling', 'Ursula K. Le Guin', 'Brandon Sanderson',
      'Neil Gaiman', 'Patrick Rothfuss', 'N.K. Jemisin', 'Leigh Bardugo', 'Sarah J. Maas',
      'Isaac Asimov', 'Arthur C. Clarke', 'Philip K. Dick', 'Ray Bradbury', 'H.G. Wells',
      'Frank Herbert', 'Orson Scott Card', 'William Gibson', 'Ursula Le Guin', 'Ursula Le Guin',
      'Ken Follett', 'Hilary Mantel', 'Anthony Doerr', 'Colson Whitehead', 'Cormac McCarthy',
      'Donna Tartt', 'Ian McEwan', 'Kazuo Ishiguro', 'Haruki Murakami', 'Gabriel Garcia Marquez',
      'Jodi Picoult', 'Frederick Forsyth', 'Tom Clancy', 'Robert Ludlum', 'Michael Connelly',
      'Sue Grafton', 'Ruth Rendell', 'P.D. James', 'Dick Francis', 'Wilkie Collins'
    ]
  },
  'Science': {
    subcategories: ['Physics', 'Chemistry', 'Biology', 'Astronomy', 'Environmental Science', 'Mathematics', 'Popular Science', 'Neuroscience'],
    authors: [
      'Stephen Hawking', 'Richard Dawkins', 'Carl Sagan', 'Neil deGrasse Tyson', 'Brian Greene',
      'Michio Kaku', 'Lawrence Krauss', 'Sean Carroll', 'Lisa Randall', 'Carlo Rovelli',
      'Francis Crick', 'James Watson', 'Rachel Carson', 'E.O. Wilson', 'Jane Goodall',
      'Bill Bryson', 'Mary Roach', 'Oliver Sacks', 'V.S. Ramachandran', 'Antonio Damasio',
      'Simon Singh', 'Ian Stewart', 'Marcus du Sautoy', 'Jordan Ellenberg', 'Steven Strogatz',
      'Andrew Wiles', 'John Nash', 'Paul Erdos', 'Leonard Susskind', 'Roger Penrose',
      'David Deutsch', 'Paul Davies', 'John Gribbin', 'Philip Ball', 'Phil Schewe',
      'Natalie Angier', 'Sylvia Earle', 'David Suzuki', 'Tim Flannery', 'Elizabeth Kolbert'
    ]
  },
  'Business': {
    subcategories: ['Entrepreneurship', 'Marketing', 'Finance', 'Leadership', 'Management', 'Investing', 'Personal Development', 'Economics'],
    authors: [
      'Peter Drucker', 'Jim Collins', 'Michael Porter', 'Clayton Christensen', 'Simon Sinek',
      'Daniel Pink', 'Malcolm Gladwell', 'Robert Kiyosaki', 'Tony Robbins', 'Dale Carnegie',
      'Stephen Covey', 'Peter Lynch', 'Benjamin Graham', 'Warren Buffett', 'Ray Dalio',
      'Howard Marks', 'Seth Godin', 'Philip Kotler', 'Al Ries', 'Jack Trout',
      'Eric Ries', 'Steve Blank', 'Guy Kawasaki', 'Marc Andreessen', 'Paul Graham',
      'Keith Rabois', 'Reid Hoffman', 'Sheryl Sandberg', 'Indra Nooyi', 'Jack Welch',
      'Alan Watts', 'Naval Ravikant', 'Tim Ferriss', 'Gary Vaynerchuk', 'Grant Cardone',
      'Robert Greene', 'Jordan Peterson', 'Ryan Holiday', 'Marcus Aurelius', 'Sun Tzu'
    ]
  },
  'Technology': {
    subcategories: ['Programming', 'Artificial Intelligence', 'Cybersecurity', 'Web Development', 'Data Science', 'Cloud Computing', 'Software Engineering', 'DevOps'],
    authors: [
      'Robert C. Martin', 'Martin Fowler', 'Donald Knuth', 'Andrew Hunt', 'David Thomas',
      'Gang of Four', 'Kent Beck', 'Alistair Cockburn', 'Eric Evans', 'Sam Newman',
      'Stuart Russell', 'Pedro Domingos', 'Ian Goodfellow', 'Yoshua Bengio', 'Geoffrey Hinton',
      'Andrej Karpathy', 'Sebastian Raschka', 'Jake VanderPlas', 'Wes McKinney', 'Hadley Wickham',
      'Linus Torvalds', 'Steve McConnell', 'Fred Brooks', 'Edsger Dijkstra', 'Niklaus Wirth',
      'Tim Berners-Lee', 'Douglas Crockford', 'John Resig', 'Ryan Dahl', 'TJ Holowaychuk',
      'Kelsey Hightower', 'Brendan Burns', 'Craig Walls', 'Sam Newman', 'Adrian Cockcroft',
      'Gene Kim', 'Jez Humble', 'Patrick Debois', 'John Willis', 'Damon Edwards'
    ]
  },
  'Romance': {
    subcategories: ['Contemporary Romance', 'Historical Romance', 'Romance Fiction', 'Young Adult Romance', 'Paranormal Romance', 'Romantic Suspense'],
    authors: [
      'Nora Roberts', 'Danielle Steel', 'Nicholas Sparks', 'Jojo Moyes', 'Colleen Hoover',
      'Julia Quinn', 'Lisa Kleypas', 'Sarah MacLean', 'Tessa Dare', 'Eloisa James',
      'Jane Austen', 'Charlotte Bronte', 'Emily Bronte', 'Louisa May Alcott', 'Frances Hodgson Burnett',
      'Judith McNaught', 'Laurell K. Hamilton', 'Christine Feehan', 'J.R. Ward', 'Sherrilyn Kenyon',
      'Robyn Carr', 'Susan Mallery', 'Brenda Jackson', 'Beverly Jenkins', 'Alexa Donovan',
      'Mia Sheridan', 'K.A. Tucker', 'Colleen Hoover', 'Taylor Jenkins Reid', 'Emily Henry',
      'Abby Jimenez', 'Helen Hoang', 'Jasmine Guillory', 'Talia Hibbert', 'Ali Hazelwood'
    ]
  },
  "Children's": {
    subcategories: ['Picture Books', 'Bedtime Stories', 'Educational', 'Fairy Tales', 'Early Readers', 'Teen Fiction', 'Classic Kids'],
    authors: [
      'Roald Dahl', 'Dr. Seuss', 'Eric Carle', 'Maurice Sendak', 'Shel Silverstein',
      'Beverly Cleary', 'Judy Blume', 'Jeff Kinney', 'Dav Pilkey', 'Raina Telgemeier',
      'Rick Riordan', 'Jeffery Kinney', 'Lemony Snicket', 'Cressida Cowell', 'Andy Griffiths',
      'Lloyd Alexander', 'Ursula Jones', 'Jeanne Birdsall', 'Blue Balliett', 'Kate DiCamillo',
      'E.B. White', 'Beverly Whatley', 'Jacqueline Wilson', 'Michael Morpurgo', 'David Walliams',
      'Julia Donaldson', 'Oliver Jeffers', 'Aaron Blabey', 'Anh Do', 'Mem Fox',
      'Anthony Browne', 'Quentin Blake', 'Raymond Briggs', 'John Burningham', 'Chris Van Allsburg'
    ]
  },
  'History': {
    subcategories: ['World History', 'Ancient Civilizations', 'Modern History', 'Military History', 'Cultural History', 'Biographical History'],
    authors: [
      'Yuval Noah Harari', 'Jared Diamond', 'David Christian', 'William McNeill', 'Fernand Braudel',
      'Edward Gibbon', 'Barbara Tuchman', 'Antony Beevor', 'Max Hastings', 'John Keegan',
      'Howard Zinn', 'Eric Hobsbawm', 'Niall Ferguson', 'Simon Schama', 'Mary Beard',
      'Dan Carlin', 'Will Durant', 'Arnold Toynbee', 'Oswald Spengler', 'Victor Davis Hanson',
      'Stephen Ambrose', 'Ron Chernow', 'Doris Kearns Goodwin', 'David McCullough', 'Walter Isaacson',
      'Robert Caro', 'Jon Meacham', 'Erik Larson', ' Hampton Sides', 'Nathaniel Philbrick',
      'Margaret MacMillan', 'Margaret MacMillan', 'Anne Applebaum', 'Timothy Snyder', 'Peter Frankopan'
    ]
  },
  'Young Adult': {
    subcategories: ['Contemporary YA', 'Fantasy YA', 'Romance YA', 'Sci-Fi YA', 'Action & Adventure YA', 'Dystopian YA'],
    authors: [
      'Suzanne Collins', 'Veronica Roth', 'James Dashner', 'Marie Lu', 'Thomas Lee',
      'John Green', 'Rainbow Rowell', 'Stephen Chbosky', 'Andrew Smith', 'Matt de la Pena',
      'Victoria Aveyard', 'Sarah J. Maas', 'Cassandra Clare', 'Leigh Bardugo', 'Holly Black',
      'Nicola Yoon', 'Jenny Han', 'Nicole Kidman', 'Angie Thomas', 'Elizabeth Acevedo',
      'Rupi Kaur', 'Adam Silvera', 'Becky Albertalli', 'Tahereh Mafi', 'Ally Condie',
      'Lois Lowry', 'Kiersten White', 'Sabaa Tahir', 'Mary E. Pearson', 'Alexandra Bracken'
    ]
  },
  'Self-Help': {
    subcategories: ['Personal Development', 'Motivation', 'Mindfulness', 'Productivity', 'Relationships', 'Finance & Wealth', 'Spirituality', 'Health & Wellness'],
    authors: [
      'James Clear', 'Joe Dispenza', 'Jordan Peterson', 'Mark Manson', 'Brené Brown',
      'Eckhart Tolle', 'Thich Nhat Hanh', 'Deepak Chopra', 'Wayne Dyer', 'Jack Canfield',
      'Robin Sharma', 'Stephen Covey', 'Napoleon Hill', 'Earl Nightingale', 'W. Clement Stone',
      'David Schwartz', ' Maxwell Maltz', 'Joseph Murphy', 'Florence Scovel Shinn', 'Wallace Wattles',
      'Michael Singer', 'Viktor Frankl', 'Manuel Search', 'Carl Jung', 'Sigmund Freud',
      'Maslow', 'M. Scott Peck', 'Harriet Lerner', 'John Gottman', 'Sue Johnson',
      'Daniel Goleman', 'Martin Seligman', 'Tal Ben-Shahar', 'Sonja Lyubomirsky', 'Mihaly Csikszentmihalyi'
    ]
  },
  'Biography': {
    subcategories: ['Autobiography', 'Memoir', 'Political Figures', 'Artists & Musicians', 'Business Leaders', 'Scientists'],
    authors: [
      'Walter Isaacson', 'Ron Chernow', 'Robert Caro', 'David McCullough', 'Jon Meacham',
      'Doris Kearns Goodwin', 'Edmund Morris', 'Taylor Branch', 'Robert A. Caro', 'Peter Ackroyd',
      'Benjamin Franklin', 'Nelson Mandela', 'Malala Yousafzai', 'Michelle Obama', 'Tara Westover',
      'Maya Angelou', 'Anne Frank', 'Helen Keller', 'Eleanor Roosevelt', 'Joan Rivers',
      'Steve Jobs', 'Elon Musk', 'Phil Knight', 'Howard Schultz', 'Ray Kroc',
      'Andrew Carnegie', 'John D. Rockefeller', 'Henry Ford', 'Walt Disney', 'Oprah Winfrey',
      'Albert Einstein', 'Marie Curie', 'Nikola Tesla', 'Charles Darwin', 'Isaac Newton',
      'Leonardo da Vinci', 'Michelangelo', 'Pablo Picasso', 'Vincent van Gogh', 'Claude Monet'
    ]
  },
  'Cook Books & Wine': {
    subcategories: ['Baking & Desserts', 'Everyday Cooking', 'International Cuisine', 'Health & Diet', 'Wine & Spirits', 'Beverages'],
    authors: [
      'Julia Child', 'Ina Garten', 'Nigella Lawson', 'Jamie Oliver', 'Gordon Ramsay',
      'Yotam Ottolenghi', 'Samin Nosrat', 'Alton Brown', 'Food Lab', 'J. Kenji Lopez-Alt',
      'Jacques Pepin', 'Marcella Hazan', 'Madhur Jaffrey', 'Fuchsia Dunlop', 'David Chang',
      'René Redzepi', 'Dominique Crenn', 'Eric Ripert', 'Thomas Keller', 'Alice Waters',
      'Deb Perelman', 'Smitten Kitchen', 'Sally McKenney', 'Stella Parks', 'Claire Saffitz',
      'Christina Tosi', 'Dominique Ansel', 'Joanne Chang', 'Molly Yeh', 'Claudia Roden',
      'Elizabeth David', 'Keith Floyd', 'Rick Stein', 'Hugh Fearnley-Whittingstall', 'Nigel Slater'
    ]
  }
};

/* ---------- Title generation ---------- */
const TITLE_PARTS = {
  'Fiction': {
    prefixes: ['The', 'A', 'An', 'Beyond', 'Through', 'Into', 'Under', 'Between', 'Before', 'After', 'Shadow', 'Lost', 'Hidden', 'Silent', 'Broken'],
    middles: ['midnight', 'shadow', 'whisper', 'echo', 'dream', 'secret', 'garden', 'river', 'mountain', 'cloud', 'storm', 'flame', 'winter', 'summer', 'autumn', 'spring', 'mirror', 'clock', 'key', 'door', 'window', 'light', 'dark', 'dawn', 'dusk', 'twilight', 'horizon', 'infinity', 'paradox'],
    suffixes: ['Chronicles', 'Legacy', 'Mystery', 'Story', 'Tale', 'Journey', 'Secret', 'Confession', 'Diary', 'Letters', 'Memoirs', 'Chronicles', 'Saga', 'Reckoning', 'Return', 'Prophecy', 'Revelation', 'Awakening', 'Requiem', 'Odyssey']
  },
  'Science': {
    prefixes: ['The', 'A', 'Our', 'The Hidden', 'The Secret', 'The Elegant', 'The Grand', 'The Brief', 'The Complete', 'The Illustrated'],
    middles: ['universe', 'atom', 'cell', 'brain', 'gene', 'quantum', 'cosmos', 'evolution', 'gravity', 'energy', 'time', 'space', 'matter', 'force', 'light', 'nature', 'life', 'consciousness', 'mathematics', 'algorithm'],
    suffixes: ['Explained', 'Revealed', 'Story', 'Journey', 'Frontiers', 'Revolution', 'Discovery', 'Paradigm', 'Principles', 'Theory', 'Perspective', 'Companion', 'Handbook', 'Primer', 'Atlas']
  },
  'Business': {
    prefixes: ['The', 'The Art', 'The Science', 'Good to Great', 'Zero to One', 'The Lean', 'The Hard Thing', 'Start with', 'Think and Grow', 'The Intelligent'],
    middles: ['startup', 'strategy', 'leadership', 'innovation', 'growth', 'culture', 'team', 'market', 'brand', 'vision', 'power', 'money', 'wealth', 'success', 'influence', 'network', 'disruption', 'leverage', 'scale', 'pivot'],
    suffixes: ['Book', 'Playbook', 'Framework', 'Method', 'Principles', 'Blueprint', 'Manifesto', 'Revolution', 'Mastery', 'Edge', 'Playbook', 'Playbook', 'System', 'Model', 'Approach']
  },
  'Technology': {
    prefixes: ['The', 'Mastering', 'Learning', 'Head First', 'Practical', 'Effective', 'Clean', 'The Pragmatic', 'Designing', 'Building'],
    middles: ['javascript', 'python', 'algorithms', 'patterns', 'architecture', 'security', 'machine learning', 'blockchain', 'cloud', 'docker', 'kubernetes', 'react', 'node', 'microservices', 'api', 'database', 'devops', 'testing', 'deployment', 'infrastructure'],
    suffixes: ['Guide', 'Handbook', 'Companion', 'Cookbook', 'Playbook', 'In Depth', 'Explained', 'Essentials', 'Mastery', 'Action', 'Tutorial', 'Reference', 'Unlocked', 'Demystified']
  },
  'Romance': {
    prefixes: ['The', 'A', 'An', 'Forever', 'Always', 'Simply', 'Truly', 'Wildly', 'Secretly', 'Unexpectedly'],
    middles: ['heart', 'love', 'passion', 'desire', 'kiss', 'embrace', 'promise', 'wedding', 'proposal', 'destiny', 'fate', 'soulmate', 'romance', 'connection', 'bond', 'attraction', 'chemistry', 'devotion', 'adventure', 'journey'],
    suffixes: ['Story', 'Affair', 'Proposal', 'Waltz', 'Season', 'Promise', 'Contract', 'Arrangement', 'Wedding', 'Diary', 'Tale', 'Chronicle', 'Romance', 'Escape', 'Reunion']
  },
  "Children's": {
    prefixes: ['The', 'My', 'Little', 'Tiny', 'Big', 'Adventures of', 'Tales from', 'Stories of', 'The Magical', 'The Wonderful'],
    middles: ['animal', 'forest', 'garden', 'rainbow', 'star', 'moon', 'sun', 'cloud', 'tree', 'flower', 'butterfly', 'dragon', 'unicorn', 'fairy', 'princess', 'knight', 'pirate', 'robot', 'monster', 'friend'],
    suffixes: ['Adventure', 'Story', 'Book', 'Tale', 'Journey', 'Quest', 'Wonder', 'Discovery', 'Mission', 'Quest', 'Expedition', 'Voyage', 'Dream', 'Storybook', 'Fable']
  },
  'History': {
    prefixes: ['The', 'A', 'An', 'The Rise', 'The Fall', 'The Dawn', 'The End', 'The Story', 'The History', 'A New'],
    middles: ['empire', 'civilization', 'revolution', 'war', 'peace', 'kingdom', 'dynasty', 'era', 'epoch', 'age', 'century', 'millennium', 'world', 'nation', 'people', 'story', 'narrative', 'chronicle', 'legacy', 'origins'],
    suffixes: ['of the World', 'of Civilization', 'of Mankind', 'of Democracy', 'of Empire', 'of Nations', 'of Power', 'of Ideas', 'of Change', 'of Progress', 'Chronicles', 'Saga', 'Story', 'Tapestry', 'Odyssey']
  },
  'Young Adult': {
    prefixes: ['The', 'A', 'An', 'Before', 'After', 'Between', 'Beyond', 'Into', 'Through', 'Last'],
    middles: ['fire', 'star', 'storm', 'shadow', 'crown', 'thorn', 'blade', 'song', 'dream', 'curse', 'blood', 'bone', 'light', 'dark', 'ash', 'steel', 'glass', 'ice', 'thunder', 'wind'],
    suffixes: ['Academy', 'Saga', 'Chronicles', 'Legacy', 'Trials', 'Games', 'War', 'Curse', 'Prophecy', 'Quest', 'Odyssey', 'Rebellion', 'Revolution', 'Prophecy', 'Chronicle']
  },
  'Self-Help': {
    prefixes: ['The', 'The Power', 'The Magic', 'The Secret', 'The Art', 'The Science', 'The Way', 'The Path', 'The Road', 'Awaken'],
    middles: ['habit', 'mindset', 'purpose', 'focus', 'discipline', 'resilience', 'gratitude', 'confidence', 'courage', 'wisdom', 'peace', 'joy', 'growth', 'change', 'strength', 'power', 'clarity', 'balance', 'success', 'freedom'],
    suffixes: ['Book', 'Guide', 'Method', 'System', 'Blueprint', 'Framework', 'Practice', 'Journey', 'Path', 'Way', 'Principles', 'Mastery', 'Revolution', 'Handbook', 'Companion']
  },
  'Biography': {
    prefixes: ['The', 'A', 'An', 'My', 'His', 'Her', 'The Life', 'The Story', 'Portrait of', 'Memoir of'],
    middles: ['life', 'journey', 'story', 'legacy', 'vision', 'dream', 'struggle', 'triumph', 'reign', 'empire', 'genius', 'titan', 'pioneer', 'legend', 'icon', 'revolutionary', 'rebel', 'warrior', 'artist', 'builder'],
    suffixes: ['Story', 'Memoir', 'Biography', 'Life', 'Journey', 'Legacy', 'Chronicles', 'Portrait', 'Witness', 'Testament', 'Recollections', 'Reminiscences', 'Confessions', 'Autobiography']
  },
  'Cook Books & Wine': {
    prefixes: ['The', 'My', 'The Art', 'The Science', 'Everyday', 'Simple', 'Quick', 'Healthy', 'Complete', 'Essential'],
    middles: ['kitchen', 'table', 'feast', 'garden', 'harvest', 'flavor', 'taste', 'aroma', 'bouquet', 'palate', 'bistro', 'cafe', 'pantry', 'cellar', 'vineyard', 'harvest', 'season', 'harvest', 'plate', 'bowl'],
    suffixes: ['Cookbook', 'Kitchen', 'Table', 'Bible', 'Companion', 'Handbook', 'Collection', 'Treasury', 'Recipes', 'Favorites', 'Classics', 'Essentials', 'Guide', 'Manual', 'Book']
  }
};

/* Deterministic pseudo-random based on seed */
function seededRandom(seed) {
  let s = seed;
  return function() {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function pick(arr, rng) {
  return arr[Math.floor(rng() * arr.length)];
}

function generateTitle(category, index, rng) {
  const parts = TITLE_PARTS[category];
  if (!parts) return `The Book ${index + 1}`;

  const style = rng();
  let title;
  if (style < 0.25) {
    title = `${pick(parts.prefixes, rng)} ${pick(parts.middles, rng)}`;
  } else if (style < 0.5) {
    title = `${pick(parts.prefixes, rng)} ${pick(parts.middles, rng)} ${pick(parts.suffixes, rng)}`;
  } else if (style < 0.7) {
    title = `${pick(parts.middles, rng)}: ${pick(parts.suffixes, rng)}`;
  } else {
    title = `${pick(parts.prefixes, rng)} ${pick(parts.middles, rng)} of ${pick(parts.middles, rng)}`;
  }
  return title.charAt(0).toUpperCase() + title.slice(1);
}

function generatePrice(rng) {
  const base = 500 + Math.floor(rng() * 20000);
  return Math.round(base / 100) * 100;
}

function generateRating(rng) {
  return Math.round((3.0 + rng() * 2.0) * 10) / 10;
}

function generateReviews(rng) {
  return Math.floor(100 + rng() * 55000);
}

function generateStock(rng) {
  return Math.floor(5 + rng() * 95);
}

/* ---------- Cover assignment ----------
   Real cover art lives in assets/covers/*.jpg. Each category gets a pool of
   themed covers; every generated book is handed one deterministically so the
   catalog shows real book covers instead of a placeholder. */
const COVER_POOLS = {
  'Fiction': [
    '1984.jpg', 'alchemist.jpg', 'a-man-called-ove.jpg', 'book-thief.jpg', 'circe.jpg',
    'daisy-jones-the-six.jpg', 'demon-copperhead.jpg', 'dune.jpg', 'great-gatsby.jpg',
    'hobbit.jpg', 'kite-runner.jpg', 'midnight-library.jpg', 'project-hail-mary.jpg',
    'silent-patient.jpg', 'the-guest-list.jpg', 'to-kill-a-mockingbird.jpg', 'verity.jpg',
    'where-crawdads-sing.jpg', 'in-five-years.jpg', 'tomorrow.jpg', 'the-silent-patient.jpg',
    'the-midnight-library.jpg', 'a-winter-wish.jpg'
  ],
  'Science': [
    'brief-history-of-time.jpg', 'cosmos.jpg', 'demon-haunted.jpg', 'selfish-gene.jpg',
    'sapiens.jpg', 'sapiens-history.jpg', 'simply-chemistry.jpg', 'thinking.jpg',
    'basic-physics.jpg', 'guns-germs-steel.jpg',
    'the-feynman-lectures-on-physics-boxed-set-the-new-millennium-edition.jpg',
    'mechanics-relativity-and-thermodynamics-open-yale-courses.jpg',
    'design-of-everyday-things.jpg'
  ],
  'Business': [
    '48-laws.jpg', 'lean-startup.jpg', 'zero-to-one.jpg', 'psychology-of-money.jpg',
    'rich-dad-poor-dad.jpg', 'start-with-why.jpg', 'how-to-win-friends.jpg', 'deep-work.jpg',
    'the-heart-principle.jpg'
  ],
  'Technology': [
    'clean-code.jpg', 'pragmatic-programmer.jpg', 'design-of-everyday-things.jpg',
    'algorithms-to-live-by.jpg', 'the-gentleman-s-guide-to-vice-and-virtue.jpg'
  ],
  'Romance': [
    'a-court-of-thorns-and-roses.jpg', 'act-your-age-eve-brown.jpg', 'a-discovery-of-witches.jpg',
    'a-winter-wish.jpg', 'beach-read.jpg', 'beautifully-cruel.jpg', 'bitten.jpg', 'book-lovers.jpg',
    'bridgerton-the-viscount-who-loved-me.jpg', 'credence.jpg', 'cruel-lies.jpg',
    'devil-in-winter.jpg', 'eleanor-park.jpg', 'fifty-shades-of-grey.jpg', 'from-blood-and-ash.jpg',
    'get-a-life-chloe-brown.jpg', 'happy-place.jpg', 'haunting-adeline.jpg', 'it-ends-with-us.jpg',
    'it-happened-one-summer.jpg', 'marrying-winterborne.jpg', 'me-before-you.jpg', 'moon-called.jpg',
    'outlander.jpg', 'pride-prejudice.jpg', 'red-white-royal-blue.jpg',
    'the-billionaire-s-fake-fianc-e.jpg', 'the-cruel-prince.jpg', 'the-deal.jpg', 'the-duke-and-i.jpg',
    'the-ex-talk.jpg', 'the-hating-game.jpg', 'the-heart-principle.jpg', 'the-notebook.jpg',
    'the-spanish-love-deception.jpg', 'the-sweetest-thing.jpg', 'they-both-die-at-the-end.jpg',
    'to-all-the-boys-ive-loved-before.jpg', 'the-gentleman-s-guide-to-vice-and-virtue.jpg'
  ],
  "Children's": [
    'charlottes-web.jpg', 'matilda.jpg', 'harry-potter-1.jpg', 'little-prince.jpg', 'the-giver.jpg'
  ],
  'History': [
    'book-thief.jpg', 'diary-of-anna-frank.jpg', 'guns-germs-steel.jpg', 'peoples-history.jpg',
    'sapiens-history.jpg', 'wager.jpg', 'long-walk-to-freedom.jpg', 'educated.jpg'
  ],
  'Young Adult': [
    'eleanor-park.jpg', 'fault-in-our-stars.jpg', 'hunger-games.jpg', 'six-of-crows.jpg',
    'the-cruel-prince.jpg', 'they-both-die-at-the-end.jpg', 'to-all-the-boys-ive-loved-before.jpg',
    'the-summer-i-turned-pretty.jpg', 'a-court-of-thorns-and-roses.jpg', 'moon-called.jpg',
    'credence.jpg', 'haunting-adeline.jpg'
  ],
  'Self-Help': [
    '5am-club.jpg', 'atomic-habits.jpg', 'creative-act.jpg', 'deep-work.jpg', 'four-agreements.jpg',
    'midnight-library.jpg', 'power-of-now.jpg', 'thinking.jpg', 'the-heart-principle.jpg'
  ],
  'Biography': [
    'becoming.jpg', 'educated.jpg', 'diary-of-anna-frank.jpg', 'long-walk-to-freedom.jpg',
    'steve-jobs.jpg', 'wager.jpg'
  ],
  'Cook Books & Wine': [
    'dessert-person.jpg', 'joy-of-cooking.jpg', 'salt-fat-acid-heat.jpg', 'wine-bible.jpg'
  ]
};

function coverFor(category, index) {
  const pool = COVER_POOLS[category];
  if (!pool || !pool.length) return 'assets/covers/default.svg';
  return 'assets/covers/' + pool[index % pool.length];
}

/* ---------- Main generation ---------- */
const books = [];
let idCounter = 1;

for (const [category, config] of Object.entries(CATEGORIES)) {
  const rng = seededRandom(category.charCodeAt(0) * 1000 + category.length * 100);

  for (let i = 0; i < BOOKS_PER_CATEGORY; i++) {
    const author = pick(config.authors, rng);
    const subcategory = pick(config.subcategories, rng);
    const title = generateTitle(category, i, seededRandom(i * 7 + category.charCodeAt(0)));
    const price = generatePrice(rng);
    const hasDiscount = rng() < 0.2;
    const oldPrice = hasDiscount ? Math.round(price * (1.15 + rng() * 0.35)) : null;
    const rating = generateRating(rng);
    const reviews = generateReviews(rng);
    const stock = generateStock(rng);
    const featured = i < 3 ? 1 : 0;
    const bestseller = rng() < 0.15 ? 1 : 0;
    const isNew = rng() < 0.1 ? 1 : 0;

    books.push({
      title,
      author,
      category,
      subcategory,
      description: `"${title}" by ${author} is a beloved ${category} book rated ${rating}/5 with ${reviews.toLocaleString()} reviews.`,
      cover: coverFor(category, i),
      price,
      oldPrice,
      stock,
      rating,
      reviews,
      featured,
      bestseller,
      isNew
    });
    idCounter++;
  }
}

/* ---------- Write output ---------- */
const outPath = path.join(__dirname, 'seed-data.json');
fs.writeFileSync(outPath, JSON.stringify(books, null, 0));

/* Print summary */
const summary = {};
for (const book of books) {
  summary[book.category] = (summary[book.category] || 0) + 1;
}
console.log(`Generated ${books.length} books:`);
for (const [cat, count] of Object.entries(summary)) {
  console.log(`  ${cat}: ${count}`);
}
console.log(`Written to ${outPath}`);
