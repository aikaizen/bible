/**
 * Curated Bible passages for seed proposals.
 * Organized by category to ensure variety.
 */

type SeedPassage = {
  reference: string;
  note: string;
  category: "ot_narrative" | "wisdom" | "prophets" | "gospels" | "epistles" | "revelation";
};

const SEED_PASSAGES: SeedPassage[] = [
  // ─── Old Testament Narrative ───
  { reference: "Genesis 1:1-31", note: "The creation of the heavens and the earth", category: "ot_narrative" },
  { reference: "Genesis 3:1-24", note: "The fall of man in the garden of Eden", category: "ot_narrative" },
  { reference: "Genesis 12:1-9", note: "God's call and promise to Abram", category: "ot_narrative" },
  { reference: "Genesis 22:1-19", note: "Abraham's faith tested with Isaac", category: "ot_narrative" },
  { reference: "Genesis 32:22-32", note: "Jacob wrestles with God at Peniel", category: "ot_narrative" },
  { reference: "Genesis 37:1-36", note: "Joseph sold by his brothers", category: "ot_narrative" },
  { reference: "Genesis 45:1-15", note: "Joseph reveals himself to his brothers", category: "ot_narrative" },
  { reference: "Exodus 3:1-22", note: "Moses and the burning bush", category: "ot_narrative" },
  { reference: "Exodus 14:10-31", note: "Crossing the Red Sea", category: "ot_narrative" },
  { reference: "Exodus 20:1-21", note: "The Ten Commandments", category: "ot_narrative" },
  { reference: "Joshua 1:1-9", note: "Be strong and courageous", category: "ot_narrative" },
  { reference: "Joshua 24:14-28", note: "Choose this day whom you will serve", category: "ot_narrative" },
  { reference: "Judges 6:11-40", note: "Gideon called by God", category: "ot_narrative" },
  { reference: "Ruth 1:1-22", note: "Ruth's loyalty to Naomi", category: "ot_narrative" },
  { reference: "1 Samuel 3:1-21", note: "God calls young Samuel", category: "ot_narrative" },
  { reference: "1 Samuel 16:1-13", note: "David anointed as king", category: "ot_narrative" },
  { reference: "1 Samuel 17:32-50", note: "David defeats Goliath", category: "ot_narrative" },
  { reference: "2 Samuel 11:1-27", note: "David and Bathsheba — consequences of sin", category: "ot_narrative" },
  { reference: "1 Kings 3:5-28", note: "Solomon asks for wisdom", category: "ot_narrative" },
  { reference: "1 Kings 18:20-40", note: "Elijah and the prophets of Baal", category: "ot_narrative" },
  { reference: "1 Kings 19:1-18", note: "Elijah flees and hears God's still small voice", category: "ot_narrative" },
  { reference: "2 Kings 5:1-19", note: "Naaman healed of leprosy", category: "ot_narrative" },
  { reference: "Daniel 3:1-30", note: "Shadrach, Meshach, and Abednego in the fiery furnace", category: "ot_narrative" },
  { reference: "Daniel 6:1-28", note: "Daniel in the lion's den", category: "ot_narrative" },
  { reference: "Jonah 1:1-17", note: "Jonah flees from God", category: "ot_narrative" },
  { reference: "Jonah 3:1-10", note: "Nineveh repents", category: "ot_narrative" },
  { reference: "Nehemiah 1:1-11", note: "Nehemiah's prayer for Jerusalem", category: "ot_narrative" },
  { reference: "Esther 4:1-17", note: "For such a time as this", category: "ot_narrative" },

  // ─── Psalms & Wisdom ───
  { reference: "Psalm 1", note: "The way of the righteous and the wicked", category: "wisdom" },
  { reference: "Psalm 8", note: "How majestic is your name in all the earth", category: "wisdom" },
  { reference: "Psalm 16", note: "Preserve me, O God — fullness of joy", category: "wisdom" },
  { reference: "Psalm 19", note: "The heavens declare the glory of God", category: "wisdom" },
  { reference: "Psalm 23", note: "The Lord is my shepherd", category: "wisdom" },
  { reference: "Psalm 27", note: "The Lord is my light and my salvation", category: "wisdom" },
  { reference: "Psalm 34", note: "Taste and see that the Lord is good", category: "wisdom" },
  { reference: "Psalm 37:1-11", note: "Do not fret — delight in the Lord", category: "wisdom" },
  { reference: "Psalm 40:1-10", note: "He set my feet upon a rock", category: "wisdom" },
  { reference: "Psalm 42", note: "As the deer pants for streams of water", category: "wisdom" },
  { reference: "Psalm 46", note: "God is our refuge and strength", category: "wisdom" },
  { reference: "Psalm 51", note: "Create in me a clean heart", category: "wisdom" },
  { reference: "Psalm 63", note: "My soul thirsts for you", category: "wisdom" },
  { reference: "Psalm 84", note: "How lovely is your dwelling place", category: "wisdom" },
  { reference: "Psalm 90", note: "Teach us to number our days", category: "wisdom" },
  { reference: "Psalm 91", note: "He who dwells in the shelter of the Most High", category: "wisdom" },
  { reference: "Psalm 103", note: "Bless the Lord, O my soul", category: "wisdom" },
  { reference: "Psalm 119:1-24", note: "Blessed are the undefiled in the way", category: "wisdom" },
  { reference: "Psalm 121", note: "I lift up my eyes to the hills", category: "wisdom" },
  { reference: "Psalm 139:1-18", note: "You have searched me and known me", category: "wisdom" },
  { reference: "Psalm 145", note: "Great is the Lord and greatly to be praised", category: "wisdom" },
  { reference: "Proverbs 1:1-19", note: "The beginning of knowledge", category: "wisdom" },
  { reference: "Proverbs 2:1-22", note: "The value of wisdom", category: "wisdom" },
  { reference: "Proverbs 3:1-12", note: "Trust in the Lord with all your heart", category: "wisdom" },
  { reference: "Proverbs 4:1-27", note: "Guard your heart above all else", category: "wisdom" },
  { reference: "Proverbs 31:10-31", note: "The excellent wife", category: "wisdom" },
  { reference: "Ecclesiastes 3:1-15", note: "A time for everything under heaven", category: "wisdom" },
  { reference: "Ecclesiastes 12:1-14", note: "Remember your Creator in your youth", category: "wisdom" },
  { reference: "Song of Solomon 2:1-17", note: "Love poetry — the rose of Sharon", category: "wisdom" },
  { reference: "Job 1:1-22", note: "Job's suffering and faithfulness", category: "wisdom" },
  { reference: "Job 38:1-41", note: "God answers Job from the whirlwind", category: "wisdom" },

  // ─── Prophets ───
  { reference: "Isaiah 6:1-13", note: "Isaiah's vision — here am I, send me", category: "prophets" },
  { reference: "Isaiah 9:1-7", note: "For unto us a child is born", category: "prophets" },
  { reference: "Isaiah 40:1-31", note: "Comfort my people — those who wait on the Lord", category: "prophets" },
  { reference: "Isaiah 43:1-13", note: "Fear not, for I have redeemed you", category: "prophets" },
  { reference: "Isaiah 53:1-12", note: "The suffering servant", category: "prophets" },
  { reference: "Isaiah 55:1-13", note: "Come, everyone who thirsts", category: "prophets" },
  { reference: "Isaiah 61:1-11", note: "The Spirit of the Lord is upon me", category: "prophets" },
  { reference: "Jeremiah 1:1-19", note: "Before I formed you in the womb I knew you", category: "prophets" },
  { reference: "Jeremiah 17:5-10", note: "Blessed is the man who trusts in the Lord", category: "prophets" },
  { reference: "Jeremiah 29:10-14", note: "Plans to prosper you and not to harm you", category: "prophets" },
  { reference: "Jeremiah 31:31-34", note: "The new covenant", category: "prophets" },
  { reference: "Ezekiel 37:1-14", note: "Valley of dry bones", category: "prophets" },
  { reference: "Hosea 6:1-6", note: "Return to the Lord — steadfast love, not sacrifice", category: "prophets" },
  { reference: "Joel 2:12-32", note: "Return to the Lord — I will pour out my Spirit", category: "prophets" },
  { reference: "Amos 5:18-27", note: "Let justice roll down like waters", category: "prophets" },
  { reference: "Micah 6:6-8", note: "Do justice, love mercy, walk humbly", category: "prophets" },
  { reference: "Habakkuk 3:17-19", note: "Yet I will rejoice in the Lord", category: "prophets" },
  { reference: "Malachi 3:1-12", note: "The messenger of the covenant — bring the tithes", category: "prophets" },

  // ─── Gospels ───
  { reference: "Matthew 4:1-11", note: "Jesus tempted in the wilderness", category: "gospels" },
  { reference: "Matthew 5:1-16", note: "The Beatitudes — salt and light", category: "gospels" },
  { reference: "Matthew 5:17-48", note: "You have heard it said — the higher law", category: "gospels" },
  { reference: "Matthew 6:1-18", note: "The Lord's Prayer and true devotion", category: "gospels" },
  { reference: "Matthew 6:25-34", note: "Do not be anxious — seek first the kingdom", category: "gospels" },
  { reference: "Matthew 7:1-29", note: "Judge not — build on the rock", category: "gospels" },
  { reference: "Matthew 13:1-23", note: "Parable of the sower", category: "gospels" },
  { reference: "Matthew 14:22-33", note: "Jesus walks on water", category: "gospels" },
  { reference: "Matthew 18:1-14", note: "Become like children — the lost sheep", category: "gospels" },
  { reference: "Matthew 25:14-30", note: "Parable of the talents", category: "gospels" },
  { reference: "Matthew 25:31-46", note: "The sheep and the goats — as you did to the least", category: "gospels" },
  { reference: "Matthew 28:1-20", note: "The resurrection and great commission", category: "gospels" },
  { reference: "Mark 1:1-20", note: "The beginning of the gospel — Jesus calls disciples", category: "gospels" },
  { reference: "Mark 2:1-12", note: "The paralytic lowered through the roof", category: "gospels" },
  { reference: "Mark 4:35-41", note: "Jesus calms the storm", category: "gospels" },
  { reference: "Mark 10:17-31", note: "The rich young ruler", category: "gospels" },
  { reference: "Mark 10:32-45", note: "The Son of Man came to serve", category: "gospels" },
  { reference: "Luke 1:26-56", note: "The annunciation and Mary's song", category: "gospels" },
  { reference: "Luke 2:1-20", note: "The birth of Jesus", category: "gospels" },
  { reference: "Luke 4:14-30", note: "Jesus rejected at Nazareth", category: "gospels" },
  { reference: "Luke 10:25-37", note: "The good Samaritan", category: "gospels" },
  { reference: "Luke 10:38-42", note: "Mary and Martha", category: "gospels" },
  { reference: "Luke 15:1-10", note: "The lost sheep and lost coin", category: "gospels" },
  { reference: "Luke 15:11-32", note: "The prodigal son", category: "gospels" },
  { reference: "Luke 18:1-14", note: "The persistent widow and the Pharisee and tax collector", category: "gospels" },
  { reference: "Luke 19:1-10", note: "Zacchaeus the tax collector", category: "gospels" },
  { reference: "Luke 24:13-35", note: "The road to Emmaus", category: "gospels" },
  { reference: "John 1:1-18", note: "In the beginning was the Word", category: "gospels" },
  { reference: "John 3:1-21", note: "You must be born again", category: "gospels" },
  { reference: "John 4:1-42", note: "The woman at the well", category: "gospels" },
  { reference: "John 6:22-40", note: "I am the bread of life", category: "gospels" },
  { reference: "John 8:1-11", note: "The woman caught in adultery", category: "gospels" },
  { reference: "John 10:1-18", note: "The good shepherd", category: "gospels" },
  { reference: "John 11:1-44", note: "Lazarus raised from the dead", category: "gospels" },
  { reference: "John 13:1-17", note: "Jesus washes the disciples' feet", category: "gospels" },
  { reference: "John 14:1-14", note: "I am the way, the truth, and the life", category: "gospels" },
  { reference: "John 15:1-17", note: "I am the vine — abide in me", category: "gospels" },
  { reference: "John 17:1-26", note: "Jesus' high priestly prayer", category: "gospels" },
  { reference: "John 20:1-31", note: "The resurrection — Thomas believes", category: "gospels" },
  { reference: "John 21:1-25", note: "Jesus restores Peter — feed my sheep", category: "gospels" },

  // ─── Acts & Epistles ───
  { reference: "Acts 2:1-21", note: "The Holy Spirit at Pentecost", category: "epistles" },
  { reference: "Acts 2:42-47", note: "The fellowship of believers", category: "epistles" },
  { reference: "Acts 9:1-22", note: "Saul's conversion on the road to Damascus", category: "epistles" },
  { reference: "Acts 17:16-34", note: "Paul in Athens — the unknown God", category: "epistles" },
  { reference: "Romans 1:16-32", note: "The righteous shall live by faith", category: "epistles" },
  { reference: "Romans 3:21-31", note: "Justified by faith, apart from the law", category: "epistles" },
  { reference: "Romans 5:1-11", note: "Peace with God through our Lord Jesus Christ", category: "epistles" },
  { reference: "Romans 6:1-14", note: "Dead to sin, alive to God", category: "epistles" },
  { reference: "Romans 8:1-17", note: "Life in the Spirit — no condemnation", category: "epistles" },
  { reference: "Romans 8:18-39", note: "Nothing can separate us from God's love", category: "epistles" },
  { reference: "Romans 12:1-21", note: "Living sacrifices — do not be conformed to this world", category: "epistles" },
  { reference: "1 Corinthians 1:18-31", note: "The foolishness of the cross", category: "epistles" },
  { reference: "1 Corinthians 9:24-27", note: "Run to win the prize", category: "epistles" },
  { reference: "1 Corinthians 12:1-31", note: "One body, many parts — spiritual gifts", category: "epistles" },
  { reference: "1 Corinthians 13:1-13", note: "The way of love", category: "epistles" },
  { reference: "1 Corinthians 15:1-28", note: "Christ is risen — the resurrection", category: "epistles" },
  { reference: "2 Corinthians 4:1-18", note: "Treasure in jars of clay", category: "epistles" },
  { reference: "2 Corinthians 5:11-21", note: "New creation — ministry of reconciliation", category: "epistles" },
  { reference: "2 Corinthians 12:1-10", note: "My grace is sufficient — power in weakness", category: "epistles" },
  { reference: "Galatians 2:15-21", note: "Justified by faith in Christ", category: "epistles" },
  { reference: "Galatians 5:1-26", note: "Freedom in Christ — fruit of the Spirit", category: "epistles" },
  { reference: "Ephesians 1:3-14", note: "Every spiritual blessing in Christ", category: "epistles" },
  { reference: "Ephesians 2:1-10", note: "By grace you have been saved through faith", category: "epistles" },
  { reference: "Ephesians 3:14-21", note: "To know the love of Christ", category: "epistles" },
  { reference: "Ephesians 4:1-16", note: "Walk worthy — unity in the body", category: "epistles" },
  { reference: "Ephesians 6:10-20", note: "The full armor of God", category: "epistles" },
  { reference: "Philippians 1:3-11", note: "He who began a good work in you", category: "epistles" },
  { reference: "Philippians 2:1-11", note: "Have this mind — Christ's humility and exaltation", category: "epistles" },
  { reference: "Philippians 3:7-21", note: "Counting all things as loss for Christ", category: "epistles" },
  { reference: "Philippians 4:4-13", note: "Rejoice always — I can do all things through Christ", category: "epistles" },
  { reference: "Colossians 1:15-23", note: "The supremacy of Christ", category: "epistles" },
  { reference: "Colossians 3:1-17", note: "Set your minds on things above", category: "epistles" },
  { reference: "1 Thessalonians 4:13-18", note: "The coming of the Lord", category: "epistles" },
  { reference: "1 Thessalonians 5:12-28", note: "Rejoice, pray, give thanks — practical holiness", category: "epistles" },
  { reference: "2 Timothy 2:1-13", note: "Be strong in the grace — endure", category: "epistles" },
  { reference: "2 Timothy 3:10-17", note: "All Scripture is God-breathed", category: "epistles" },
  { reference: "Hebrews 1:1-14", note: "God has spoken by his Son", category: "epistles" },
  { reference: "Hebrews 4:1-16", note: "A Sabbath rest — approach the throne of grace boldly", category: "epistles" },
  { reference: "Hebrews 11:1-16", note: "The hall of faith — by faith they...", category: "epistles" },
  { reference: "Hebrews 11:17-40", note: "More from the hall of faith — all commended", category: "epistles" },
  { reference: "Hebrews 12:1-13", note: "Run with endurance — looking to Jesus", category: "epistles" },
  { reference: "James 1:1-27", note: "Count it all joy — be doers of the word", category: "epistles" },
  { reference: "James 2:1-26", note: "Faith without works is dead", category: "epistles" },
  { reference: "James 3:1-18", note: "Taming the tongue", category: "epistles" },
  { reference: "1 Peter 1:3-12", note: "A living hope — an inheritance imperishable", category: "epistles" },
  { reference: "1 Peter 2:1-12", note: "Living stones — a chosen people", category: "epistles" },
  { reference: "1 Peter 5:1-11", note: "Cast all your anxieties on him", category: "epistles" },
  { reference: "2 Peter 1:3-11", note: "His divine power has granted us everything", category: "epistles" },
  { reference: "1 John 1:1-10", note: "Walking in the light", category: "epistles" },
  { reference: "1 John 3:1-24", note: "See what kind of love the Father has given us", category: "epistles" },
  { reference: "1 John 4:7-21", note: "God is love", category: "epistles" },

  // ─── Revelation ───
  { reference: "Revelation 1:1-20", note: "The revelation of Jesus Christ — a vision of glory", category: "revelation" },
  { reference: "Revelation 2:1-7", note: "Letter to Ephesus — return to your first love", category: "revelation" },
  { reference: "Revelation 3:14-22", note: "Letter to Laodicea — I stand at the door and knock", category: "revelation" },
  { reference: "Revelation 4:1-11", note: "The throne room of heaven", category: "revelation" },
  { reference: "Revelation 5:1-14", note: "The Lamb is worthy to open the scroll", category: "revelation" },
  { reference: "Revelation 7:9-17", note: "The great multitude from every nation", category: "revelation" },
  { reference: "Revelation 21:1-8", note: "A new heaven and a new earth", category: "revelation" },
  { reference: "Revelation 22:1-21", note: "The river of life — come, Lord Jesus", category: "revelation" },
];

/**
 * Pick N unique seed passages, avoiding references the group has already read.
 * Tries to pick from diverse categories.
 */
export function pickSeedPassages(
  count: number,
  alreadyReadReferences: string[],
): Array<{ reference: string; note: string }> {
  const readSet = new Set(alreadyReadReferences.map((r) => r.toLowerCase().trim()));

  const available = SEED_PASSAGES.filter(
    (p) => !readSet.has(p.reference.toLowerCase().trim()),
  );

  if (available.length === 0) return [];

  // Group by category
  const byCategory = new Map<string, SeedPassage[]>();
  for (const p of available) {
    const list = byCategory.get(p.category) ?? [];
    list.push(p);
    byCategory.set(p.category, list);
  }

  const categories = Array.from(byCategory.keys());
  const result: Array<{ reference: string; note: string }> = [];
  const usedCategories = new Set<string>();

  // First pass: one per category for diversity
  for (let i = 0; i < count && categories.length > 0; i++) {
    const unusedCategories = categories.filter((c) => !usedCategories.has(c));
    const catPool = unusedCategories.length > 0 ? unusedCategories : categories;
    const cat = catPool[Math.floor(Math.random() * catPool.length)];
    const list = byCategory.get(cat)!;
    const idx = Math.floor(Math.random() * list.length);
    const pick = list[idx];
    result.push({ reference: pick.reference, note: pick.note });
    list.splice(idx, 1);
    if (list.length === 0) {
      byCategory.delete(cat);
      const ci = categories.indexOf(cat);
      if (ci >= 0) categories.splice(ci, 1);
    }
    usedCategories.add(cat);
  }

  return result.slice(0, count);
}
