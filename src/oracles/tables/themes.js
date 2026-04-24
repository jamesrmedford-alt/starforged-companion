/**
 * src/oracles/tables/themes.js
 * Location Themes: Chaotic, Haunted, Infested, Inhabited, Mechanical, Ruined, Sacred
 * Source: Starforged Reference Guide pp.100-109
 */

// ── CHAOTIC ───────────────────────────────────────────────────────────────────
export const CHAOTIC_FEATURE = [
  { min: 1,  max: 8,   result: "Alterations in the flow of time" },
  { min: 9,  max: 16,  result: "Anomalous energies" },
  { min: 17, max: 24,  result: "Corrupted data or records" },
  { min: 25, max: 32,  result: "Distorted geometry" },
  { min: 33, max: 40,  result: "Environment transformed by chaos" },
  { min: 41, max: 48,  result: "Evidence of the fragmentation of reality" },
  { min: 49, max: 56,  result: "Illusory visions" },
  { min: 57, max: 64,  result: "Lifeforms mutated by chaotic energy" },
  { min: 65, max: 72,  result: "Mechanism or technology affected by chaos" },
  { min: 73, max: 80,  result: "Twisted landscape" },
  { min: 81, max: 88,  result: "Unpredictable hazards" },
  { min: 89, max: 96,  result: "Warped structures or terrain" },
  { min: 97, max: 100, result: "Descriptor + Focus", ref: "descriptor_focus" },
];

export const CHAOTIC_PERIL = [
  { min: 1,  max: 9,   result: "Distorting energies harm you or your gear" },
  { min: 10, max: 18,  result: "Hazardous manifestation of chaos" },
  { min: 19, max: 27,  result: "Lifeforms mutated or driven berserk" },
  { min: 28, max: 36,  result: "Maddening visions of another reality" },
  { min: 37, max: 45,  result: "Paradox or anomaly has lethal consequences" },
  { min: 46, max: 54,  result: "Reality distortion makes navigation impossible" },
  { min: 55, max: 63,  result: "Shifting or warping paths" },
  { min: 64, max: 72,  result: "Something valuable is pulled into the void" },
  { min: 73, max: 81,  result: "Temporal distortion has disorienting effects" },
  { min: 82, max: 90,  result: "Uncontrolled forces are unleashed" },
  { min: 91, max: 98,  result: "Action + Theme", ref: "action_theme" },
  { min: 99, max: 100, result: "Roll twice" },
];

export const CHAOTIC_OPPORTUNITY = [
  { min: 1,  max: 20,  result: "Chaos inadvertently helps you" },
  { min: 21, max: 40,  result: "Chaotic energies provide a temporary advantage" },
  { min: 41, max: 60,  result: "Passage or route appears through the distortion" },
  { min: 61, max: 80,  result: "Rare resource is revealed by the chaos" },
  { min: 81, max: 100, result: "Useful or interesting artifact or device" },
];

// ── HAUNTED ───────────────────────────────────────────────────────────────────
export const HAUNTED_FEATURE = [
  { min: 1,  max: 8,   result: "Disembodied voices" },
  { min: 9,  max: 16,  result: "Eerie cold" },
  { min: 17, max: 24,  result: "Foreboding omen or message" },
  { min: 25, max: 32,  result: "Ghostly visions of this place in another time" },
  { min: 33, max: 40,  result: "Glimpses of shadowy movement" },
  { min: 41, max: 48,  result: "Objects move of their own accord" },
  { min: 49, max: 56,  result: "Sensation of being watched" },
  { min: 57, max: 64,  result: "Signs of death or violence" },
  { min: 65, max: 72,  result: "Spectral sounds" },
  { min: 73, max: 80,  result: "Twisted or altered architecture or terrain" },
  { min: 81, max: 88,  result: "Unnatural blight, decay, or ruin" },
  { min: 89, max: 96,  result: "Unnatural mists or darkness" },
  { min: 97, max: 100, result: "Descriptor + Focus", ref: "descriptor_focus" },
];

export const HAUNTED_PERIL = [
  { min: 1,  max: 9,   result: "Assailed by an angry or vengeful being" },
  { min: 10, max: 18,  result: "Beguiling illusions tempt you to linger or stay" },
  { min: 19, max: 27,  result: "Besieged by frightening sensations" },
  { min: 28, max: 36,  result: "Equipment is plagued by unexplainable malfunctions" },
  { min: 37, max: 45,  result: "Plunged into disorienting darkness or illusionary surroundings" },
  { min: 46, max: 54,  result: "Spectral manifestations of your fears" },
  { min: 55, max: 63,  result: "Spirits or undead reveal surprising abilities or motivations" },
  { min: 64, max: 72,  result: "Sudden, shocking reveal of a ghostly manifestation or undead form" },
  { min: 73, max: 81,  result: "Trickery leads you into danger" },
  { min: 82, max: 90,  result: "Visions reveal a horrifying aspect of this place" },
  { min: 91, max: 98,  result: "Action + Theme", ref: "action_theme" },
  { min: 99, max: 100, result: "Roll twice" },
];

export const HAUNTED_OPPORTUNITY = [
  { min: 1,  max: 20,  result: "Encounter with a benign spirit or being" },
  { min: 21, max: 40,  result: "Helpful vision of past events" },
  { min: 41, max: 60,  result: "Message or clue offers insight into the nature of this haunting" },
  { min: 61, max: 80,  result: "Secret area or path is revealed" },
  { min: 81, max: 100, result: "Useful or interesting artifact or device" },
];

// ── INFESTED ──────────────────────────────────────────────────────────────────
export const INFESTED_FEATURE = [
  { min: 1,  max: 8,   result: "Corpse of an unfortunate victim" },
  { min: 9,  max: 16,  result: "Eggs, cocoons, or nest" },
  { min: 17, max: 24,  result: "Environment corrupted by the infestation" },
  { min: 25, max: 32,  result: "Evidence of a lurking creature" },
  { min: 33, max: 40,  result: "Evidence of an ill-fated victim" },
  { min: 41, max: 48,  result: "Hoarded food" },
  { min: 49, max: 56,  result: "Indistinct movement or sounds" },
  { min: 57, max: 64,  result: "Lair of lesser creatures" },
  { min: 65, max: 72,  result: "Ravaged supplies or equipment" },
  { min: 73, max: 80,  result: "Remains of a creature or remnants of a previous form" },
  { min: 81, max: 88,  result: "Territorial markings" },
  { min: 89, max: 96,  result: "Trail or evidence of a creature's passage" },
  { min: 97, max: 100, result: "Descriptor + Focus", ref: "descriptor_focus" },
];

export const INFESTED_PERIL = [
  { min: 1,  max: 9,   result: "Creatures attack without warning" },
  { min: 10, max: 18,  result: "Creatures guided or controlled by a greater threat" },
  { min: 19, max: 27,  result: "Creatures reveal new aspects or abilities" },
  { min: 28, max: 36,  result: "Creatures reveal surprising cleverness" },
  { min: 37, max: 45,  result: "Creatures take or destroy something important" },
  { min: 46, max: 54,  result: "Discovery of a live but threatened victim" },
  { min: 55, max: 63,  result: "Hazardous architecture or terrain" },
  { min: 64, max: 72,  result: "Lured or driven into a trap or dead-end" },
  { min: 73, max: 81,  result: "Powerful or dominant creature reveals itself" },
  { min: 82, max: 90,  result: "Toxic or sickening environment" },
  { min: 91, max: 98,  result: "Action + Theme", ref: "action_theme" },
  { min: 99, max: 100, result: "Roll twice" },
];

export const INFESTED_OPPORTUNITY = [
  { min: 1,  max: 20,  result: "Clue to the nature or vulnerabilities of these creatures" },
  { min: 21, max: 40,  result: "Creatures turn on each other" },
  { min: 41, max: 60,  result: "Early warning of an attack or ambush" },
  { min: 61, max: 80,  result: "External event provides a helpful distraction" },
  { min: 81, max: 100, result: "Helpful resource or equipment" },
];

// ── INHABITED ─────────────────────────────────────────────────────────────────
export const INHABITED_FEATURE = [
  { min: 1,  max: 8,   result: "Conspicuous patrols or surveillance" },
  { min: 9,  max: 16,  result: "Crews at work" },
  { min: 17, max: 24,  result: "Display or monument honors a notable cultural event" },
  { min: 25, max: 32,  result: "Emergency teams responding to an incident or crisis" },
  { min: 33, max: 40,  result: "Families gathering or children playing" },
  { min: 41, max: 48,  result: "Festival, celebration, or observance" },
  { min: 49, max: 56,  result: "Fight breaks out" },
  { min: 57, max: 64,  result: "Notable figure stands out from the crowd" },
  { min: 65, max: 72,  result: "Protest or strike" },
  { min: 73, max: 80,  result: "Unrepaired damage" },
  { min: 81, max: 88,  result: "Unusually empty or quiet area" },
  { min: 89, max: 96,  result: "Vendor or merchant hawking their wares" },
  { min: 97, max: 100, result: "Descriptor + Focus", ref: "descriptor_focus" },
];

export const INHABITED_PERIL = [
  { min: 1,  max: 9,   result: "Announcement or notification brings harrowing news" },
  { min: 10, max: 18,  result: "Arrival of a foe or rival" },
  { min: 19, max: 27,  result: "Blockade or security cordon cuts off needed access" },
  { min: 28, max: 36,  result: "Caught in the crossfire of a dispute" },
  { min: 37, max: 45,  result: "Disturbing evidence of exploitive conditions" },
  { min: 46, max: 54,  result: "Lured into danger" },
  { min: 55, max: 63,  result: "Signs of disease, infestation, or toxic environment" },
  { min: 64, max: 72,  result: "Signs of unrest or rebellion" },
  { min: 73, max: 81,  result: "Signs that you are being watched or followed" },
  { min: 82, max: 90,  result: "Unwanted attention from authority or enemies" },
  { min: 91, max: 98,  result: "Action + Theme", ref: "action_theme" },
  { min: 99, max: 100, result: "Roll twice" },
];

export const INHABITED_OPPORTUNITY = [
  { min: 1,  max: 20,  result: "Intriguing offer from an unexpected source" },
  { min: 21, max: 40,  result: "Lively festival or gathering place provides a chance to socialize" },
  { min: 41, max: 60,  result: "Local gossip proves interesting or helpful" },
  { min: 61, max: 80,  result: "Needed item, resource, or buyer is available" },
  { min: 81, max: 100, result: "Old friend or connection resurfaces" },
];

// ── MECHANICAL ────────────────────────────────────────────────────────────────
export const MECHANICAL_FEATURE = [
  { min: 1,  max: 8,   result: "Control station or terminal" },
  { min: 9,  max: 16,  result: "Device or technology with a mysterious function" },
  { min: 17, max: 24,  result: "Disassembled machinery or parts" },
  { min: 25, max: 32,  result: "Heavy machinery at work" },
  { min: 33, max: 40,  result: "Machine fabrication or repair" },
  { min: 41, max: 48,  result: "Machines emulating or fusing with biological life" },
  { min: 49, max: 56,  result: "Machines in stasis or powered down" },
  { min: 57, max: 64,  result: "Machines single-mindedly executing a function or program" },
  { min: 65, max: 72,  result: "Major project under construction" },
  { min: 73, max: 80,  result: "Mechanical environment in motion or transforming" },
  { min: 81, max: 88,  result: "Mechanical wreckage or destruction" },
  { min: 89, max: 96,  result: "Power source for the machines" },
  { min: 97, max: 100, result: "Descriptor + Focus", ref: "descriptor_focus" },
];

export const MECHANICAL_PERIL = [
  { min: 1,  max: 9,   result: "Alarm or warning is triggered" },
  { min: 10, max: 18,  result: "Automated weapon or trap is activated" },
  { min: 19, max: 27,  result: "Environment made unsuitable for life" },
  { min: 28, max: 36,  result: "Hostile machines on patrol" },
  { min: 37, max: 45,  result: "Machines transform to reveal new capabilities" },
  { min: 46, max: 54,  result: "Machines with corrupted or hacked programming" },
  { min: 55, max: 63,  result: "Malfunctioning machines or technology" },
  { min: 64, max: 72,  result: "Moving machinery creates a danger or obstacle" },
  { min: 73, max: 81,  result: "Under surveillance by a central machine intelligence" },
  { min: 82, max: 90,  result: "Volatile technology" },
  { min: 91, max: 98,  result: "Action + Theme", ref: "action_theme" },
  { min: 99, max: 100, result: "Roll twice" },
];

export const MECHANICAL_OPPORTUNITY = [
  { min: 1,  max: 20,  result: "Helpful device" },
  { min: 21, max: 40,  result: "Insight into the workings or purpose of the machines" },
  { min: 41, max: 60,  result: "Intelligent machine offers aid" },
  { min: 61, max: 80,  result: "Salvageable resource" },
  { min: 81, max: 100, result: "Wondrous technology" },
];

// ── RUINED ────────────────────────────────────────────────────────────────────
export const RUINED_FEATURE = [
  { min: 1,  max: 8,   result: "Collapsed or broken structures or terrain" },
  { min: 9,  max: 16,  result: "Device or artifact with residual power or function" },
  { min: 17, max: 24,  result: "Focal point or nexus of the destruction" },
  { min: 25, max: 32,  result: "Graves or corpses" },
  { min: 33, max: 40,  result: "Innermost or hidden spaces laid bare by the destruction" },
  { min: 41, max: 48,  result: "Message or recording from before the fall" },
  { min: 49, max: 56,  result: "Overgrown or entombed spaces" },
  { min: 57, max: 64,  result: "Rubble-strewn paths" },
  { min: 65, max: 72,  result: "Sad memento of a lost life" },
  { min: 73, max: 80,  result: "Sights or sounds of structural instability" },
  { min: 81, max: 88,  result: "Signs of looting or scavenging" },
  { min: 89, max: 96,  result: "Survivors or guardians dwell among the ruins" },
  { min: 97, max: 100, result: "Descriptor + Focus", ref: "descriptor_focus" },
];

export const RUINED_PERIL = [
  { min: 1,  max: 9,   result: "Dreadful atmosphere of loss and destruction weighs upon you" },
  { min: 10, max: 18,  result: "Evidence of a horrible fate for others who passed this way" },
  { min: 19, max: 27,  result: "Hazardous atmosphere or environment" },
  { min: 28, max: 36,  result: "Hostile creature has staked out their territory" },
  { min: 37, max: 45,  result: "Imminent collapse or destruction" },
  { min: 46, max: 54,  result: "Lured into a trap or targeted by automated defenses" },
  { min: 55, max: 63,  result: "Source of the destruction persists or returns anew" },
  { min: 64, max: 72,  result: "Unearthed secrets best left buried" },
  { min: 73, max: 81,  result: "Unstable or broken path" },
  { min: 82, max: 90,  result: "Volatile device or artifact" },
  { min: 91, max: 98,  result: "Action + Theme", ref: "action_theme" },
  { min: 99, max: 100, result: "Roll twice" },
];

export const RUINED_OPPORTUNITY = [
  { min: 1,  max: 20,  result: "Access to an untouched or preserved area" },
  { min: 21, max: 40,  result: "Insight into what brought this place to ruin" },
  { min: 41, max: 60,  result: "Interesting or useful device or artifact" },
  { min: 61, max: 80,  result: "Salvageable equipment or resources" },
  { min: 81, max: 100, result: "Shortcut or passage through the destruction" },
];

// ── SACRED ────────────────────────────────────────────────────────────────────
export const SACRED_FEATURE = [
  { min: 1,  max: 8,   result: "Adherents performing worship or enacting rituals" },
  { min: 9,  max: 16,  result: "Altar or temple" },
  { min: 17, max: 24,  result: "Dwellings for the faithful" },
  { min: 25, max: 32,  result: "Enigmatic symbols" },
  { min: 33, max: 40,  result: "Graves or remains of glorified disciples" },
  { min: 41, max: 48,  result: "Holy text or archives" },
  { min: 49, max: 56,  result: "Offerings or atonements" },
  { min: 57, max: 64,  result: "Pilgrims arriving to pay homage" },
  { min: 65, max: 72,  result: "Protected reliquary of an artifact or token" },
  { min: 73, max: 80,  result: "Religious art or idols" },
  { min: 81, max: 88,  result: "Subtle manifestations of mystical power or visions" },
  { min: 89, max: 96,  result: "Tokens or motifs representing the faith's domain" },
  { min: 97, max: 100, result: "Descriptor + Focus", ref: "descriptor_focus" },
];

export const SACRED_PERIL = [
  { min: 1,  max: 9,   result: "An aspect of the faith beguiles you or lures you into danger" },
  { min: 10, max: 18,  result: "Dreadful aspects or powers of the faith are revealed" },
  { min: 19, max: 27,  result: "Embodiment of a god or power is given corrupted form or purpose" },
  { min: 28, max: 36,  result: "Guardians seek martyrdom in defense of this place" },
  { min: 37, max: 45,  result: "Leaders corrupt or exploit their followers to oppose you" },
  { min: 46, max: 54,  result: "Prophecies portend a dire threat" },
  { min: 55, max: 63,  result: "Protective ward or enigmatic puzzle blocks the way" },
  { min: 64, max: 72,  result: "Religious artifact evokes unnerving power" },
  { min: 73, max: 81,  result: "Unnatural corruption or decay fouls the environment" },
  { min: 82, max: 90,  result: "Zealots enact a ceremony to unlock forbidden powers" },
  { min: 91, max: 98,  result: "Action + Theme", ref: "action_theme" },
  { min: 99, max: 100, result: "Roll twice" },
];

export const SACRED_OPPORTUNITY = [
  { min: 1,  max: 20,  result: "Access to a hidden or sealed area" },
  { min: 21, max: 40,  result: "Encounter with a helpful adherent or heretic" },
  { min: 41, max: 60,  result: "Insight into the nature or history of the faith" },
  { min: 61, max: 80,  result: "Insight into the schemes or methods of religious zealots" },
  { min: 81, max: 100, result: "Interesting or valuable artifact or device" },
];
