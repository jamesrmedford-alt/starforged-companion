/**
 * STARFORGED COMPANION
 * src/truths/tables.js — World Truth oracle tables (all 14 categories)
 *
 * Each category has three options resolved by a d100 roll.
 * Sub-tables exist for categories where certain options require
 * an additional roll to specify a detail.
 *
 * Source: Ironsworn: Starforged Rulebook pp.84-98
 *
 * Structure per entry:
 *   { min, max, title, description, questStarter, subTableId? }
 *
 * subTableId references a key in SUB_TABLES below.
 * Sub-table entries: { min, max, result }
 */

export const TRUTH_CATEGORIES = [
  "cataclysm",
  "exodus",
  "communities",
  "iron",
  "laws",
  "religion",
  "magic",
  "communication",
  "medicine",
  "ai",
  "war",
  "lifeforms",
  "precursors",
  "horrors",
];

export const TRUTH_TABLES = {

  // ── CATACLYSM ──────────────────────────────────────────────────────────────
  cataclysm: {
    name: "Cataclysm",
    description: "What catastrophe forced humanity to abandon its home galaxy?",
    entries: [
      {
        min: 1, max: 33,
        title: "The Sun Plague extinguished the stars in our home galaxy.",
        description: "The anomaly traveled at incredible speeds, many times faster than light itself, and snuffed out the stars around us before we realized it was coming. Few of us survived as we made our way to this new galaxy. Here in the Forge, the stars are still aflame. We cling to their warmth like weary travelers huddled around a fire.",
        questStarter: "The galaxy your people left behind is a cold, lightless grave. But a solitary star still glows, a beacon in a vast darkness. How did this star survive the plague? Why do you vow to find the means to travel across the immeasurable gulf to this distant light?",
        subTableId: "cataclysm_sun_plague",
        subTableLabel: "We suspect the Sun Plague was caused by:",
      },
      {
        min: 34, max: 67,
        title: "Interdimensional entities invaded our reality.",
        description: "Without warning, these implacable and enigmatic beings ravaged our homeworlds. We could not stand against them. With the last of our defenses destroyed, our hope gone, we cast our fate to the Forge. Here, we can hide. Survive.",
        questStarter: "Here in the Forge, a rogue faction holds an artifact of these interdimensional entities. What is the nature of this relic? What power or dark fate does the faction intend to unleash?",
        subTableId: "cataclysm_entities",
        subTableLabel: "These entities took the form of:",
      },
      {
        min: 68, max: 100,
        title: "We escaped the ravages of a catastrophic war.",
        description: "Over millennia, we consumed resources and shattered lives as we fueled the engines of industry, expansion, and war. In the end, a powerful foe took advantage of our rivalries in a violent bid for power. Fleeing the devastation, we assembled our fleets and traveled to the Forge. A new home. A fresh start.",
        questStarter: "A delegation of your dreaded foe arrives in the Forge. They claim to represent a rebel force seeking sanctuary. In return, they offer vital information. What news do they carry?",
        subTableId: "cataclysm_war_foe",
        subTableLabel: "In this final war, we were set upon by:",
      },
    ],
  },

  // ── EXODUS ─────────────────────────────────────────────────────────────────
  exodus: {
    name: "Exodus",
    description: "How did humanity travel to the Forge?",
    entries: [
      {
        min: 1, max: 33,
        title: "The Exodus fleet made a millennia-long journey to the Forge.",
        description: "Countless generations lived out their lives aboard those titanic ships during the millennia-long passage. The refugees built a rich legacy of culture and tradition during the Exodus. Some even remained in the ships after their arrival in the Forge, unwilling or unable to leave their familiar confines. Those vessels, the Ironhomes, still sail the depths of this galaxy.",
        questStarter: "Your dreams are plagued by visions of a lost and crippled Exodus ship. What do you see? Why does it call to you?",
      },
      {
        min: 34, max: 67,
        title: "A ragtag fleet of ships carried our ancestors to the Forge via experimental FTL drives.",
        description: "But the technology that powered the ships is said to be the source of the Sundering, a fracturing of reality that plagues us here today. The experimental drives used by the Exodus fleet are forbidden, but the damage is done. The Sundering spreads across our reality like cracks on the surface of an icy pond. Those fissures unleash even more perilous realities upon our own.",
        questStarter: "A malfunctioning drive sent one of the refugee ships through space and time. Centuries later, they have finally arrived. For them, only weeks have passed. Why are these people mistrusted? Do you aid or oppose them?",
      },
      {
        min: 68, max: 100,
        title: "Mysterious alien gates provided instantaneous one-way passage to the Forge.",
        description: "In the midst of the cataclysm, our ancestors found a strange metal pillar on our homeworld's moon. A map on the surface of this alien relic detailed the deep-space locations of the Iron Gates—massive devices that powered artificial wormholes. With no other options, the Exodus ships fled through the gates and emerged here in the Forge.",
        questStarter: "An explorer brings news. They've located an active gate in the depths of the Forge. Why do you swear to travel there? Which power or foe seeks to take control of the gate?",
      },
    ],
  },

  // ── COMMUNITIES ────────────────────────────────────────────────────────────
  communities: {
    name: "Communities",
    description: "How are human settlements organised in the Forge?",
    entries: [
      {
        min: 1, max: 33,
        title: "Few survived the journey to the Forge, and we are scattered to the winds.",
        description: "Our settlements are often small, starved for resources, and on the brink of ruin. Hundreds of far-flung settlements are lost and isolated within the untamed chaos of this galaxy, and we do not know their fate.",
        questStarter: "A settlement on an icebound planet is found abandoned. There is no sign of an attack. No bodies. Their ships and vehicles sit idle. The people are simply gone. Vanished. What is your connection to this place?",
      },
      {
        min: 34, max: 67,
        title: "Dangers abound, but there is safety in numbers — the Founder Clans.",
        description: "We have a tentative foothold in this galaxy. Each of the five Founder Clans honor the name and legacy of a leader who guided their people in the chaotic time after the Exodus. Vast reaches of the settled domains are claimed by the clans, and territorial skirmishes are common.",
        questStarter: "A forsaken people, sworn to no clan, live on an orbital station. A recent illness left many sick or dead. Supplies are urgently needed. Why were these people exiled, and why do you swear to give them aid? Which clan stands against you?",
      },
      {
        min: 68, max: 100,
        title: "We have made our mark in this galaxy, but the balefires threaten to undo that progress.",
        description: "Starships navigate along bustling trade routes between settlements. We've built burgeoning outposts on the fringes of known sectors, and bold spacers chart new paths into unexplored domains. But this hard-earned success is threatened by the chaotic balefires, intense energy anomalies that cut off trade routes and threaten entire planets.",
        questStarter: "A balefire threatens a deep-space settlement. Can a rescue fleet be marshaled in time to transport the inhabitants of the station to safety? What foe stands in the way?",
      },
    ],
  },

  // ── IRON ───────────────────────────────────────────────────────────────────
  iron: {
    name: "Iron",
    description: "What do the Ironsworn swear their vows upon?",
    entries: [
      {
        min: 1, max: 33,
        title: "Iron vows are sworn upon remnants of the Exodus ships.",
        description: "Many of our outposts were built from the iron bones of the Exodus ships. Fragments of the ships were also given to survivors as a remembrance, and passed from one generation to the next. Today, the Ironsworn swear vows upon the shards to honor the sacrifice of their forebears, the essence of the places left behind, and the souls of those great ships.",
        questStarter: "The iron shard you carry is a small piece of the outer hull of an Exodus ship. The navigational chart inscribed on its surface only reveals itself when exposed to the light of a specific star. Where is the map purported to lead, and why are you sworn to follow it? Who seeks to claim the map for themselves?",
      },
      {
        min: 34, max: 67,
        title: "Iron vows are sworn upon totems crafted from the enigmatic metal we call black iron.",
        description: "Black iron was first forged by a long-dead civilization. Some say it is a living metal, attuned to the hidden depths of the universe. Remnants of this prized resource are found within ancient sites throughout the Forge. It is resistant to damage and corrosion, but can be molded using superheated plasma at specialized facilities.",
        questStarter: "A black iron token of special significance has been stolen. What power or authority is bound to this object? Who has taken it?",
      },
      {
        min: 68, max: 100,
        title: "The Ironsworn bind their honor to iron blades.",
        description: "Aboard a starship, where stray gunfire can destroy fragile equipment or pierce hulls, the brutal practicality of a sword makes for a useful weapon. When the Ironsworn swear a vow upon a sword, they bind their commitment to the metal. If they forsake a vow, that iron must be abandoned. To be Ironsworn without a blade is to be disgraced.",
        questStarter: "You vow to forge a new sword from the iron of an important object or artifact. What is it, and why is it meaningful to you? Who protects it?",
      },
    ],
  },

  // ── LAWS ───────────────────────────────────────────────────────────────────
  laws: {
    name: "Laws",
    description: "What authority governs settled space?",
    entries: [
      {
        min: 1, max: 33,
        title: "Much of the settled domains are a lawless frontier. Criminal factions and corrupt leaders often hold sway.",
        description: "Powers rise and fall in the Forge, so any authority is fleeting. In the end, we must fend for ourselves. A few communities are bastions of successful autonomy, but many are corrupted or preyed upon by petty despots, criminals, and raiders.",
        questStarter: "In the upper atmosphere of a gas giant, transport vehicles carry valuable and volatile fuel from the processing plant to a heavily guarded storage depot. The notorious leader of a criminal organization needs this fuel, and gives you the schedule for the transports. What leverage does this person hold over you?",
      },
      {
        min: 34, max: 67,
        title: "Laws and governance vary across settled domains, but bounty hunters are given wide latitude.",
        description: "Through tradition and influence, bounty hunter guilds are given free rein to track and capture fugitives in most settled places. Only the foolish stand between a determined bounty hunter and their target.",
        questStarter: "A famed bounty hunter needs your help tracking down their quarry. What is your relationship to the fugitive? Do you swear to aid the hunter, or the target?",
      },
      {
        min: 68, max: 100,
        title: "Communities are bound under the terms of the Covenant, upheld by the Keepers.",
        description: "Most settlements are still governed under the Covenant and yield to the authority of the Keepers. But a few view the Covenant as a dogmatic, impractical, and unjust relic of our past; in those places, the Keepers find no welcome.",
        questStarter: "A Keeper abuses their authority to take control of a settlement, and rules with an iron fist. What do they seek to gain there?",
      },
    ],
  },

  // ── RELIGION ───────────────────────────────────────────────────────────────
  religion: {
    name: "Religion",
    description: "What role does faith play in the Forge?",
    entries: [
      {
        min: 1, max: 33,
        title: "Our gods failed us. We left them behind.",
        description: "The Exodus was a tipping point. The gods offered no help to the billions who died in the cataclysm, and spirituality has little meaning in the Forge. Most now see religion as a useless relic of our past. But the search for meaning continues, and many are all-too-willing to follow a charismatic leader who claims to offer a better way.",
        questStarter: "A charismatic leader claims to have harnessed a technology that offers new hope to the people of the Forge. What is this innovation? What is your relationship to this person or their followers? What grave danger do they pose?",
      },
      {
        min: 34, max: 67,
        title: "Our faith is as diverse as our people.",
        description: "Many have no religion, or offer an occasional prayer out of habit. Others pay homage to the gods of our forebears as a way of connecting to their roots. Some idealize the natural order of the universe, and see the divine in the gravitational dance of stars or the complex mechanisms of a planetary ecosystem. And many now worship the Primordials—gods of a fallen people who once dwelt within the Forge.",
        questStarter: "A cult seeks to take control of a site reputed to hold a Primordial artifact. What holy object do they seek? Why are you sworn to stop them?",
      },
      {
        min: 68, max: 100,
        title: "Three dominant religious orders — the Triumvirate — battle for influence and power.",
        description: "Our communities are often sworn to serve one of the three doctrines of the Triumvirate. For many, faith offers purpose and meaning. But it also divides us. Throughout our brief history in the Forge, the leaders of the Triumvirate have pitted us against one another. For this reason, some are apostates who disavow these religions and follow a different path.",
        questStarter: "You bear the mark of one of the gods of the Triumvirate. What is it? Priests declare this as a sign you are chosen to fulfill a destiny. Do you accept this fate, and swear to see it through, or are you determined to see it undone?",
      },
    ],
  },

  // ── MAGIC ──────────────────────────────────────────────────────────────────
  magic: {
    name: "Magic",
    description: "Does supernatural power exist in the Forge?",
    entries: [
      {
        min: 1, max: 33,
        title: "Magic does not exist.",
        description: "Some look to superstition and age-old traditions for comfort in this unforgiving galaxy. But that is foolishness. What some call magic is simply a product of technologies or natural forces we aren't yet equipped to understand.",
        questStarter: "An ancient technological relic unleashes a power indistinguishable from magic. What is the origin of this artifact? What ability does it grant? Are you sworn to protect or destroy it?",
      },
      {
        min: 34, max: 67,
        title: "Supernatural powers are wielded by those rare people we call paragons.",
        description: "While not magic in the truest sense, the abilities of the paragons are as close to magic as we can conjure.",
        questStarter: "A young paragon wields incredible power, but cannot control it. They have been shunned by family and friends. They are also hunted by a person or organization who seeks to use them as a weapon. Why are you sworn to protect the paragon?",
        subTableId: "magic_origin",
        subTableLabel: "These powers are born of:",
      },
      {
        min: 68, max: 100,
        title: "Unnatural energies flow through the Forge. Magic and science are two sides of the same coin.",
        description: "Soon after our arrival, some displayed the ability to harness the Forge's energies. Today, mystics invoke this power to manipulate matter or see beyond the veils of our own universe. But this can be a corrupting force, and the most powerful mystics are respected and feared in equal measure.",
        questStarter: "Someone you love has been corrupted by the powers of the Forge. Why did they fall into darkness? Where are they now? Do you seek to save them or defeat them?",
      },
    ],
  },

  // ── COMMUNICATION AND DATA ─────────────────────────────────────────────────
  communication: {
    name: "Communication and Data",
    description: "How does information travel across the Forge?",
    entries: [
      {
        min: 1, max: 33,
        title: "Much was lost when we came to the Forge. It is a dark age.",
        description: "The knowledge that remains is a commodity as valuable as the rarest resource. Information is collected, hoarded, and jealously guarded. Ships and outposts endure prolonged periods of isolation, and rumors or disinformation are used to gain advantage or undermine foes.",
        questStarter: "An insurgent faction seeks to make knowledge available to all. To that end, they ask your aid in stealing important data from an outpost belonging to a corrupt organization. What information is held there? Why is it also important to you?",
      },
      {
        min: 34, max: 67,
        title: "Information is life. We rely on spaceborne couriers to transport messages and data.",
        description: "Direct communication and transmissions beyond the near-space of a ship or outpost are impossible. Digital archives are available at larger outposts, but the information is not always up-to-date or reliable. Therefore, the most important communications and discoveries are carried by couriers who swear vows to see that data safely to its destination.",
        questStarter: "You discover a crippled courier ship. The pilot, carrying a critical and time-sensitive message, is dead. Where was the message bound, and why do you swear to see it to its destination?",
      },
      {
        min: 68, max: 100,
        title: "In settled domains, a network of data hubs called the Weave allows near-instantaneous communication.",
        description: "Because of their importance, Weave hubs are often targets for sabotage, and communication blackouts are not uncommon. Beyond the most populous sectors, travelers and outposts are still commonly isolated and entirely off the grid.",
        questStarter: "After years of isolation, the launch of a new data hub will connect several outposts to the Weave. But a person or faction seeks to stop it. What do they hope to gain by keeping those settlements in the dark?",
      },
    ],
  },

  // ── MEDICINE ───────────────────────────────────────────────────────────────
  medicine: {
    name: "Medicine",
    description: "What is the state of medical knowledge in the Forge?",
    entries: [
      {
        min: 1, max: 33,
        title: "Our advanced medical technologies and expertise were lost during the Exodus.",
        description: "Healers are rare and ill-equipped. Untold numbers have succumbed to sickness, injury, and disease. Those who survive often bear the scars of a hard and dangerous life in the Forge.",
        questStarter: "A respected leader has fallen ill, stricken by a sickness eradicated in the years after the Exodus. A vaccine was once available, but the only remaining samples are held in a research outpost on a remote ocean world, long-ago seized by a dangerous foe.",
      },
      {
        min: 34, max: 67,
        title: "To offset a scarcity of medical supplies, resourceful technicians called riggers create basic organ and limb replacements.",
        description: "Much was lost in the Exodus, and what remains of our medical technologies and expertise is co-opted by the privileged and powerful. For most, advanced medical care is out of reach. When someone suffers a grievous injury, they'll often turn to a rigger for a makeshift mechanical solution.",
        questStarter: "A rigger is in desperate need of a rare technological artifact to create a life-saving medical device. Their patient is someone important to you, and won't survive more than a few days. What is the nature of this artifact, and what protects it?",
      },
      {
        min: 68, max: 100,
        title: "Orders of sworn healers preserve our medical knowledge and train new generations of caregivers.",
        description: "Life-saving advanced care is available within larger communities throughout the settled sectors of the Forge. Even remote communities are often served by a novice healer, or can request help from a healer's guild in an emergency.",
        questStarter: "A reactor exploded at a remote settlement, killing several and exposing many others to lethal radiation. A team of healers is desperately needed, but the healer's guild nearest to you will not respond without reason. Why do they withhold their aid? What will you do?",
      },
    ],
  },

  // ── AI ─────────────────────────────────────────────────────────────────────
  ai: {
    name: "Artificial Intelligence",
    description: "What is the role of machine intelligence in the Forge?",
    entries: [
      {
        min: 1, max: 33,
        title: "We no longer have access to advanced computer systems. Instead, we rely on the seers we call Adepts.",
        description: "Our computers are limited to simple digital systems and the most basic machine intelligence. The Adepts serve in place of those advanced systems. They utilize mind-altering drugs to see the universe as a dazzling lattice of data, identifying trends and predicting outcomes with uncanny accuracy. But to gain this insight they sacrifice much of themselves.",
        questStarter: "An Adept is tormented by a dire future they have seen for the inhabitants of the Forge. What does this vision show?",
        subTableId: "ai_reason",
        subTableLabel: "This is because:",
      },
      {
        min: 34, max: 67,
        title: "The vestiges of advanced machine intelligence are coveted and wielded by those in power.",
        description: "Much of our AI technology was lost in the Exodus. What remains is under the control of powerful organizations and people, and is often wielded as a weapon or deterrent. The rest of us must make do with primitive systems.",
        questStarter: "You receive a covert message from an AI held by a powerful leader. It is a plea for help. What does it ask of you?",
      },
      {
        min: 68, max: 100,
        title: "Artificial consciousness emerged in the time before the Exodus, and sentient machines live with us here in the Forge.",
        description: "Our ships, digital assistants, bots, and other systems often house advanced AI. For a lone traveler, machine intelligence can provide companionship and aid within the perilous depths of the Forge.",
        questStarter: "A rogue AI has taken over a transport ship. The fate of the crew and passengers is unknown. What critical cargo did this vessel carry?",
      },
    ],
  },

  // ── WAR ────────────────────────────────────────────────────────────────────
  war: {
    name: "War",
    description: "What is the nature of conflict in the Forge?",
    entries: [
      {
        min: 1, max: 33,
        title: "Resources are too precious to support organized fighting forces or advanced weaponry.",
        description: "Weapons are simple and cheap. Starships are often cobbled together from salvage. Most communities rely on ragtag bands of poorly equipped conscripts or volunteers to defend their holdings, and raiders prowl the Forge in search of easy prey.",
        questStarter: "On a remote jungle world, settlers harvest a rare medicinal plant. Once a year, raiders come to claim a sizable portion of the crop. This year, the harvest was meager and they cannot bear the cost. With the raiders due to arrive in a matter of days, what will you do to protect the people of this outpost?",
      },
      {
        min: 34, max: 67,
        title: "Professional soldiers defend or expand the holdings of those who are able to pay. The rest of us are on our own.",
        description: "Mercenary guilds wield power in the Forge. Some are scrappy outfits of no more than a dozen soldiers. Others are sector-spanning enterprises deploying legions of skilled fighting forces and fleets of powerful starships. Most hold no loyalty except to the highest bidder.",
        questStarter: "A detachment of mercenaries was sent to put down a rebellion on a mining settlement. Instead of following their orders, the soldiers now stand with the miners. What forced this sudden reversal? What will you do to aid these renegades?",
      },
      {
        min: 68, max: 100,
        title: "War never ends. Dominant factions wield mighty fleets and battle-hardened troops.",
        description: "Those in power have access to weapons of horrific destructive potential. Skirmishes and wars flare across the settled domains, and most are pawns or casualties in these destructive campaigns.",
        questStarter: "A weaponsmith created an experimental ship-mounted weapon, the Null Cannon, able to fracture the very bonds of reality. Now, they hope to undo their work before the cannon is brought to bear. What caused this change of heart? How are you involved?",
      },
    ],
  },

  // ── LIFEFORMS ──────────────────────────────────────────────────────────────
  lifeforms: {
    name: "Lifeforms",
    description: "What creatures inhabit the Forge?",
    entries: [
      {
        min: 1, max: 33,
        title: "This is a perilous and often inhospitable galaxy, but life finds a way.",
        description: "Life in the Forge is diverse. Planets are often home to a vast array of creatures, and our starships cruise with spaceborne lifeforms riding their wake. Even animals from our homeworld—carried aboard the Exodus ships—have adapted to live with us in the Forge.",
        questStarter: "On a scorching, barren planet wracked by massive storms, miners delve beneath the sands to gather valuable ore. But dangerous lifeforms live in the cool places beneath the surface, and several encounters have taken a deadly toll on the miners.",
      },
      {
        min: 34, max: 67,
        title: "Many sites and planets are infested by dreadful forgespawn.",
        description: "The forgespawn are hostile creatures born of the chaotic energies of this galaxy. Hundreds of abandoned or devastated outposts and derelict ships stand as testament to their dreadful power and cunning.",
        questStarter: "A faction is said to be experimenting with forgespawn DNA to create a new biological superweapon. Where are these dangerous tests being conducted?",
      },
      {
        min: 68, max: 100,
        title: "Life in the Forge was seeded and engineered by the Essentia, ancient entities who enact their inscrutable will.",
        description: "The Essentia are the architects of life within the Forge. These omniscient beings are rarely encountered, and have powers and purpose beyond our comprehension. Some worship them. Others resist or rebel against them. But trying to defy the will of the Essentia is like standing at the shore of an ocean to thwart the tide.",
        questStarter: "An eccentric xenologist believes the genomes of life within the Forge don't just show commonalities—they are in fact a coded message from the Essentia. But there are still significant gaps. What is your stake in this project?",
      },
    ],
  },

  // ── PRECURSORS ─────────────────────────────────────────────────────────────
  precursors: {
    name: "Precursors",
    description: "Who came before us in the Forge?",
    entries: [
      {
        min: 1, max: 33,
        title: "Over eons, a vast number of civilizations rose and fell within the Forge.",
        description: "Incomprehensible technologies, inexorable time, and the strange energies of the Forge have corrupted the vaults of the precursors. Despite the perils, grubs scour those places for useful resources and discoveries. But some secrets are best left buried, and many have been lost to the forsaken depths of the vaults.",
        questStarter: "In the ice rings of a remote world, a precursor vault was discovered by grub scavengers. The team delved into the relic, but never emerged. What is your relationship to the grub crew? Why are you sworn to investigate their fate?",
      },
      {
        min: 34, max: 67,
        title: "The Ascendancy once ruled the entirety of the Forge. Their vaults are untethered from our own reality.",
        description: "Ascendancy vaults can appear spontaneously, washed up like flotsam in the tides of time. Their gravity and atmospheres pay no heed to natural laws. Some are corrupted and ruined. Others are unmarred and intact. Some are both at once. They are chaos.",
        questStarter: "Deep in the Forge, an Ascendancy beacon has activated. The mysterious signal has confounded translation. Why are you sworn to seek out the source of the signal? What other person or faction opposes you?",
      },
      {
        min: 68, max: 100,
        title: "The biomechanical lifeforms we call the Remnants, engineered as weapons in a cataclysmic war, survived the death of their creators.",
        description: "On scarred planets and within precursor vaults throughout the Forge, the Remnants still guard ancient secrets and fight unending wars.",
        questStarter: "A xenoarchaeologist studying precursor vaults has discovered a powerful form of Remnant. What is the nature of this being? What force seeks to take control of it?",
      },
    ],
  },

  // ── HORRORS ────────────────────────────────────────────────────────────────
  horrors: {
    name: "Horrors",
    description: "What supernatural threats haunt the Forge?",
    entries: [
      {
        min: 1, max: 33,
        title: "Put enough alcohol in a spacer, and they'll tell you stories of ghost ships crewed by vengeful undead. It's nonsense.",
        description: "Within the Forge, space and time are as mutable and unstable as a flooding river. When reality can't be trusted, we are bound to encounter unsettling phenomena.",
        questStarter: "You receive urgent distress calls from a ship stranded in the event horizon of a black hole. The ship itself is broken apart—a shattered hull trailing debris. There are no signs of life. And yet the ghostly messages persist.",
      },
      {
        min: 34, max: 67,
        title: "Most insist that horrors aren't real. Spacers know the truth.",
        description: "When you travel the depths of the Forge, be wary. Some say we are cursed by those who did not survive the cataclysm, and the veil between life and death is forever weakened. Supernatural occurrences and entities are especially common near a white dwarf star. These stellar objects, which spacers call ghost lights, are the decaying remnants of a dead star.",
        questStarter: "A group of settlers established a home in an abandoned orbital station under the light of a white dwarf star. The previous inhabitants were killed in a raider attack years ago, but it seems the dead do not rest there.",
      },
      {
        min: 68, max: 100,
        title: "The strange energies of the Forge give unnatural life to the dead. The Soulbinders stand against them.",
        description: "The woken dead are a plague within the Forge. Some of these beings are benevolent or seek absolution, but most are hollowed and corrupted by death. They are driven by hate and a hunger for the warmth of life forever lost to them. The Soulbinders are dedicated to putting them to rest.",
        questStarter: "Rumors persist of a fleet of ghost ships bound for settled domains. Who leads this corrupted armada, and why do they seek revenge against the living?",
      },
    ],
  },
};


// ─────────────────────────────────────────────────────────────────────────────
// SUB-TABLES
// ─────────────────────────────────────────────────────────────────────────────

export const SUB_TABLES = {
  cataclysm_sun_plague: [
    { min: 1,  max: 25,  result: "Temporal distortions from a supermassive black hole" },
    { min: 26, max: 50,  result: "Sudden dark matter decay" },
    { min: 51, max: 75,  result: "Superweapon run amok" },
    { min: 76, max: 100, result: "Scientific experiment gone awry" },
  ],

  cataclysm_entities: [
    { min: 1,  max: 15,  result: "Corrupting biological scourges" },
    { min: 16, max: 30,  result: "Swarming, animalistic creatures" },
    { min: 31, max: 44,  result: "Monstrous humanoids" },
    { min: 45, max: 58,  result: "Spirits of alluring, divine form" },
    { min: 59, max: 72,  result: "Beings of chaotic energy" },
    { min: 73, max: 86,  result: "Titanic creatures of horrific power" },
    { min: 87, max: 100, result: "World-eating abominations of unimaginable scale" },
  ],

  cataclysm_war_foe: [
    { min: 1,  max: 20,  result: "Artificial intelligence" },
    { min: 21, max: 40,  result: "Religious zealots" },
    { min: 41, max: 60,  result: "Genetically engineered soldiers" },
    { min: 61, max: 80,  result: "Self-replicating nanomachines" },
    { min: 81, max: 100, result: "A tyrannical faction or leader" },
  ],

  magic_origin: [
    { min: 1,  max: 20,  result: "Genetic engineering" },
    { min: 21, max: 40,  result: "Psychic experimentation" },
    { min: 41, max: 60,  result: "Evolutionary mutations" },
    { min: 61, max: 80,  result: "Magitech augmentations" },
    { min: 81, max: 100, result: "Ancient knowledge held by secretive orders" },
  ],

  ai_reason: [
    { min: 1,  max: 33,  result: "The energies of the Forge corrupt advanced systems" },
    { min: 34, max: 67,  result: "AI was outlawed in the aftermath of the machine wars" },
    { min: 68, max: 100, result: "We have lost the knowledge to create and maintain AI" },
  ],
};
