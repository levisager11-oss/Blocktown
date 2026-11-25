// Every text of the game in English. The German texts (texts.de.ts) have the same keys.
// {name} is filled in by the game; "@b.park" inside an argument points to another text.
export const en: Record<string, string> = {
  "game.name": "Blocktown",
  "game.tagline": "Build a city, block by block",
  "ach.toast": "Achievement: {name}",

  // ---- general
  "ui.cancel": "Cancel", "ui.build": "Build", "ui.undo": "Undo", "ui.openLine": "Open line", "ui.close": "Close", "ui.yes": "Yes", "ui.no": "No",
  "ui.ok": "OK", "ui.back": "Back", "ui.locked": "Unlocks at {name}", "ui.perDay": "a day", "ui.day": "Day {n}", "ui.year": "Year {n}",
  "ui.free": "free", "ui.none": "None", "ui.on": "On", "ui.off": "Off", "ui.more": "More", "ui.demolish": "Demolish", "ui.goThere": "Show",
  "ui.pause": "Pause", "ui.speed": "Speed {n}", "ui.menu": "Menu",

  // ---- modes
  "mode.chill": "Chill", "mode.normal": "Normal", "mode.hard": "Hard",
  "mode.chill.d": "Endless money, everything unlocked, no disasters. Just build. No high scores.",
  "mode.normal.d": "Start small. New buildings unlock as your city grows. Counts for high scores.",
  "mode.hard.d": "Little money, higher costs, more disasters, and you can go bankrupt. Its own high-score list.",
  "size.small": "Small", "size.medium": "Medium", "size.large": "Large",

  // ---- toolbar
  "cat.inspect": "Look", "cat.roads": "Roads", "cat.zones": "Zones", "cat.power": "Power", "cat.water": "Water", "cat.services": "Services",
  "cat.edu": "Schools", "cat.parks": "Parks", "cat.transit": "Transit", "cat.bulldoze": "Bulldoze", "cat.views": "Views",
  "tool.straight": "Straight", "tool.curve": "Curve", "tool.upgrade": "Change type",
  "tool.brush": "Brush", "tool.dezone": "Remove zone", "tool.busLine": "Bus line", "tool.metroLine": "Metro line", "tool.lines": "Lines",

  // ---- roads
  "r.street": "Street", "r.avenue": "Avenue", "r.highway": "Highway",
  "rd.street": "Two lanes. Buildings grow along it.", "rd.avenue": "Four lanes for busy routes. Buildings grow along it.", "rd.highway": "Fast, for long trips. No buildings along it.",

  // ---- zones
  "z.none": "No zone", "z.resLow": "Houses", "z.resHigh": "Apartments", "z.comLow": "Shops", "z.comHigh": "Shopping centres", "z.industry": "Industry",
  "z.office": "Offices", "z.farm": "Farms", "z.forestry": "Forestry", "z.ore": "Mining", "z.oil": "Oil",
  "zd.resLow": "Homes for a few families.", "zd.resHigh": "Tall homes for many people. Needs good services to grow.", "zd.comLow": "Small shops. Jobs, and a place to buy things.",
  "zd.comHigh": "Big stores and hotels. Many jobs.", "zd.industry": "Factories. Many simple jobs, but dirty and loud: keep them away from homes.",
  "zd.office": "Clean jobs for people with a good education.", "zd.farm": "Grows crops. Only on fertile land.", "zd.forestry": "Harvests wood. Only in forests.",
  "zd.ore": "Digs up ore. Only where there is ore in the ground. Dirty.", "zd.oil": "Pumps oil. Only where there is oil in the ground. Dirty.",
  "level": "Level {n}",

  // ---- buildings placed by hand
  "b.wind": "Wind turbine", "b.coal": "Coal power plant", "b.solar": "Solar park", "b.nuclear": "Nuclear power plant",
  "b.pump": "Water pump", "b.tower": "Water tower", "b.outlet": "Sewage outlet", "b.treatment": "Sewage treatment plant", "b.septic": "Septic tank",
  "b.landfill": "Landfill", "b.recycling": "Recycling centre", "b.incinerator": "Waste incinerator",
  "b.police": "Police station", "b.policeHq": "Police headquarters", "b.fire": "Fire station", "b.fireHq": "Fire headquarters",
  "b.clinic": "Clinic", "b.hospital": "Hospital", "b.school": "Primary school", "b.highSchool": "High school", "b.university": "University",
  "b.park": "Small park", "b.playground": "Playground", "b.plaza": "Plaza", "b.bigPark": "City park", "b.stadium": "Stadium",
  "b.busDepot": "Bus depot", "b.metro": "Metro station",
  "bd.wind": "Clean power. Makes more when it is windy, and stops in a storm.", "bd.coal": "A lot of cheap power, and a lot of smoke.",
  "bd.solar": "Clean power. Makes less under clouds and in winter.", "bd.nuclear": "A huge amount of clean power. Costs a lot to run.",
  "bd.pump": "Pumps water from a river, lake or the sea. Must stand near the water.", "bd.tower": "Water anywhere, but not much of it.",
  "bd.outlet": "Lets sewage into the water. Must stand near the water. Smells.", "bd.septic": "Takes a little sewage anywhere, far from the water. Smells a bit.", "bd.treatment": "Cleans a lot of sewage without the smell. Can stand anywhere.",
  "bd.landfill": "Takes the city's rubbish. Nobody wants to live next to it.", "bd.recycling": "Handles rubbish cleanly.", "bd.incinerator": "Burns a lot of rubbish and makes power from it.",
  "bd.police": "Keeps the area around it safe.", "bd.policeHq": "Keeps a large part of the city safe.",
  "bd.fire": "Makes fires rare nearby and sends engines to put them out.", "bd.fireHq": "Protects a large part of the city from fire.",
  "bd.clinic": "Health care for the neighbourhood.", "bd.hospital": "Health care for a large part of the city.",
  "bd.school": "Children nearby learn to read and count. Educated people get better jobs.", "bd.highSchool": "The next step after primary school. Needed for offices.",
  "bd.university": "The best education. Its students run the offices and factories of tomorrow.",
  "bd.park": "A bit of green. People nearby are happier, and the land is worth more.", "bd.playground": "Families love to live near one.",
  "bd.plaza": "A place to meet, with a fountain.", "bd.bigPark": "A big park with a pond. Makes a whole district nicer.", "bd.stadium": "A day out for the whole city.",
  "bd.busDepot": "Needed for bus lines. Each depot has room for 16 buses.", "bd.metro": "A stop of the metro. Build at least two and join them with a metro line.",
  "stat.makesPower": "Power", "stat.makesWater": "Water", "stat.sewage": "Sewage", "stat.garbage": "Rubbish", "stat.radius": "Reach",
  "stat.seats": "Pupils", "stat.beds": "Patients", "stat.upkeep": "Upkeep", "stat.jobs": "Jobs",

  // ---- info views
  "view.none": "Normal", "view.traffic": "Traffic", "view.value": "Land value", "view.pollution": "Pollution", "view.noise": "Noise",
  "view.police": "Police", "view.fire": "Fire safety", "view.health": "Health", "view.school": "Education", "view.charm": "Parks",
  "view.soil": "Fertile land", "view.forest": "Forest", "view.ore": "Ore", "view.oil": "Oil", "view.flood": "Flood danger",

  // ---- hints under the tools
  "hint.roadStart": "Tap where the road starts. It snaps to other roads.", "hint.roadNext": "Now tap where it ends.", "hint.roadBend": "Tap where the road bends.",
  "hint.roadEnd": "{len} m", "hint.upgrade": "Tap a road to change it to this type.", "hint.upgradeCost": "Change this road",
  "hint.zone": "Paint along roads. Buildings grow by themselves.", "hint.dezone": "Paint over zones to remove them.",
  "hint.place": "Pick a spot next to a road.", "hint.placeShore": "Pick a spot next to a road, near the water.", "hint.confirmPlace": "Build it here?",
  "hint.bulldoze": "Tap a road or a building to remove it.", "hint.bus": "Tap roads to place stops ({n} so far). The bus drives them in order, round and round.",
  "hint.metro": "Tap metro stations in order ({n} so far).",

  // ---- why something can't be done
  "why.short": "Too short", "why.outside": "Outside the map", "why.tooClose": "Too close to another road", "why.angle": "Roads meet at too flat an angle",
  "why.sharp": "The bend is too sharp", "why.steep": "Too steep", "why.fixed": "This highway can't be changed", "why.building": "A building is in the way",
  "why.locked": "Not unlocked yet", "why.money": "Not enough money", "why.noRoad": "Needs a road next to it", "why.water": "Too close to the water",
  "why.shore": "Must stand near the water", "why.same": "Already this type", "why.stops": "A line needs at least two stops", "why.lines": "No more lines possible",
  "why.depot": "Build a bus depot first", "why.buses": "No free buses: build another depot", "why.needStation": "Tap a metro station", "why.needRoad": "Tap a street or an avenue",

  // ---- problems of buildings
  "prob.noRoad": "No road to the highway", "prob.noPower": "No power", "prob.noWater": "No water", "prob.sewage": "Sewage backs up",
  "prob.abandoned": "Abandoned", "prob.fire": "On fire!", "prob.burnt": "Destroyed", "prob.flood": "Flooded", "prob.unhappy": "People are unhappy here",
  "grow.noRoad": "Nothing grows here: no road.", "grow.noHighway": "Nothing grows here: the road doesn't lead to the highway.",
  "grow.noResource": "Nothing grows here: the land doesn't have what this zone needs. Check the views.", "grow.noDemand": "Nothing grows here yet: the city doesn't need more of this zone right now.",
  "grow.soon": "A building will grow here soon.",

  // ---- messages
  "note.milestone": "Your city is now a {name}! Reward: {reward}. New things are unlocked.", "note.loanPaid": "A loan is paid off.",
  "note.broke": "The city is out of money. Raise taxes, cut budgets or take a loan.", "note.bankrupt": "The city is bankrupt. It no longer counts for high scores.",
  "note.heat": "A heat wave: people need more water and power, and pumps deliver less.", "note.cold": "A cold snap: heating needs much more power.",
  "note.storm": "A storm is coming. Wind turbines stop.", "note.fire": "Fire! An engine is on its way.", "note.fireNoHelp": "Fire! No fire station can reach it.",
  "note.fireOut": "The fire is out.", "note.stormDamage": "The storm destroyed a building.", "note.floodWarn": "The water is rising! Low land by the water will flood.",
  "note.flooded": "{n} buildings are under water.", "note.floodOver": "The flood is over.", "note.lineOpen": "The line is open.",
  "note.saved": "City saved.", "note.saveFull": "Not saved: the storage is full. Delete another city.", "note.saveError": "The city could not be saved.",
  "note.unranked": "Chill mode: no high scores.", "note.welcomeBack": "Welcome back to {name}.",
  "confirm.demolish": "Demolish the {name}?", "confirm.deleteCity": "Delete {name} for good?", "confirm.newCity": "Leave this city? It is saved first.",
  "confirm.deleteLine": "Close this line?",

  // ---- milestones
  "ms.0": "Camp", "ms.1": "Hamlet", "ms.2": "Village", "ms.3": "Big village", "ms.4": "Small town", "ms.5": "Town", "ms.6": "Big town",
  "ms.7": "City", "ms.8": "Big city", "ms.9": "Metropolis", "ms.10": "Capital", "ms.11": "Megacity", "ms.12": "Megalopolis",
  "ms.title": "Milestones", "ms.next": "Next: {name} at {n} citizens", "ms.unlocks": "Unlocks", "ms.reached": "Reached", "ms.all": "You have reached every milestone.",
  "ms.chill": "In chill mode everything is unlocked from the start.",
  "feat.water": "Water and sewage", "feat.garbage": "Rubbish", "feat.budget": "Taxes and budgets", "feat.loans": "Loans", "feat.health": "Health care",
  "feat.edu": "Schools", "feat.safety": "Police and fire safety", "feat.fires": "Fires can break out", "feat.transit": "Bus lines", "feat.industry": "Farms and forestry",
  "feat.storms": "Storms and floods", "feat.metro": "Metro",

  // ---- top bar
  "hud.pop": "Citizens", "hud.money": "Money", "hud.happy": "Happiness", "hud.traffic": "Traffic", "hud.demand": "What the city wants",
  "hud.r": "Homes", "hud.c": "Shops", "hud.i": "Industry", "hud.o": "Offices",
  "season.spring": "Spring", "season.summer": "Summer", "season.autumn": "Autumn", "season.winter": "Winter",
  "sky.clear": "Clear", "sky.cloudy": "Cloudy", "sky.rain": "Rain", "sky.storm": "Storm", "sky.fog": "Fog", "sky.snow": "Snow",

  // ---- panels
  "panel.budget": "Money", "panel.city": "City", "panel.transit": "Bus and metro", "panel.options": "Options", "panel.help": "How to play", "panel.goods": "Goods",
  "budget.income": "Income a day", "budget.expense": "Costs a day", "budget.net": "Left over a day", "budget.taxes": "Taxes", "budget.services": "Budgets",
  "budget.servicesHint": "More money makes a service reach further and do more. Less saves money.", "budget.loans": "Loans",
  "budget.loanOffer": "{amount}, paid back over {days} days ({total} in all)", "budget.take": "Take", "budget.repay": "Pay off now ({left})",
  "budget.loanLeft": "{left} left, {perDay} a day", "budget.noLoans": "Loans unlock when your city is a village.", "budget.maxLoans": "Three loans at most.",
  "budget.locked": "Taxes and budgets unlock when your city is a village.",
  "inc.r": "Homes", "inc.c": "Shops", "inc.i": "Industry", "inc.o": "Offices", "inc.fares": "Tickets", "inc.trade": "Exports",
  "exp.roads": "Roads", "exp.loans": "Loans", "exp.power": "Power", "exp.water": "Water", "exp.garbage": "Rubbish", "exp.police": "Police", "exp.fire": "Fire brigade",
  "exp.health": "Health", "exp.edu": "Schools", "exp.parks": "Parks", "exp.transit": "Bus and metro",
  "city.score": "City score", "city.scoreHow": "Citizens × happiness × traffic × education", "city.scoreParts": "{pop} × {happy} × {traffic} × {school}",
  "city.people": "People", "city.workers": "Workers", "city.jobs": "Jobs", "city.unemployed": "Without work", "city.education": "Education",
  "edu.0": "No school", "edu.1": "Primary school", "edu.2": "High school", "edu.3": "University",
  "city.supply": "Supply", "city.power": "Power", "city.water": "Water", "city.sewage": "Sewage", "city.garbage": "Rubbish", "city.schools": "School places",
  "city.health": "Health care", "city.cleanPower": "Clean power", "city.history": "Citizens over time", "city.map": "Map", "city.seed": "Map code: {seed}",
  "city.mode": "Mode", "city.best": "Most citizens so far: {n}", "city.land": "Land value",
  "goods.title": "Made in the city", "goods.hint": "Factories earn more with materials from the city's own land, shops with goods from its own factories. What is missing comes in by lorry over the highway.",
  "goods.crops": "Crops", "goods.wood": "Wood", "goods.ore": "Ore", "goods.oil": "Oil", "goods.goods": "Goods for shops", "goods.makes": "{make} of {need} needed",
  "transit.none": "No lines yet. Build a bus depot, then draw a bus line along your streets.", "transit.bus": "Bus line {n}", "transit.metro": "Metro line {n}",
  "transit.riders": "{n} passengers a day", "transit.vehicles": "Vehicles", "transit.stops": "{n} stops", "transit.buses": "Buses in use: {used} of {all}",
  "transit.close": "Close line", "transit.full": "Full! Add vehicles.", "transit.total": "{n} passengers a day in all",
  "insp.residents": "{n} of {cap} residents", "insp.workers": "{n} of {cap} jobs filled", "insp.happy": "Happiness", "insp.value": "Land value", "insp.access": "Roads",
  "insp.eff": "Running at", "insp.works": "Working at {n}%", "insp.road": "{len} m long", "insp.jam": "Traffic", "insp.jamFree": "flows", "insp.jamSlow": "slow", "insp.jamStuck": "jammed",
  "insp.bridge": "Bridge", "insp.change": "Change to", "insp.zoneEmpty": "Empty plot", "insp.pollution": "Pollution", "insp.noise": "Noise", "insp.services": "Services nearby",
  "insp.construction": "Being built", "insp.givenHighway": "This highway was here before your city. It can't be changed, but you can join roads to it.",

  // ---- options
  "opt.language": "Language", "opt.sound": "Sound effects", "opt.ambience": "Background sounds", "opt.quality": "Graphics", "opt.quality.low": "Fast", "opt.quality.medium": "Balanced",
  "opt.quality.high": "Pretty (with shadows)", "opt.dayNight": "Day and night", "opt.disasters": "Disasters", "opt.disastersChill": "Never in chill mode.",
  "opt.advisor": "Advisor", "opt.autosave": "The city is saved by itself every minute.", "opt.cameraPad": "Camera buttons",

  // ---- menus
  "menu.continue": "Continue", "menu.new": "New city", "menu.load": "My cities", "menu.options": "Options", "menu.help": "How to play", "menu.resume": "Back to the city",
  "menu.save": "Save", "menu.main": "Main menu", "menu.fullscreen": "Full screen",
  "new.title": "New city", "new.name": "Name", "new.mode": "Mode", "new.size": "Map size", "new.seed": "Map code", "new.seedHint": "The same code gives the same land. Share it with friends!",
  "new.roll": "Another map", "new.start": "Found the city", "new.noSlot": "You have three cities already. Delete one to start a new one.",
  "load.title": "My cities", "load.empty": "No cities yet.", "load.info": "{pop} citizens · day {day} · {mode}", "load.play": "Play", "load.delete": "Delete",
  "over.title": "Bankrupt", "over.text": "The city ran out of money for too long. You can keep building here, but it no longer counts for high scores.", "over.keep": "Keep building",

  // ---- advisor
  "adv.name": "Advisor",
  "adv.start": "Welcome, mayor! A highway already crosses the land. Pick Roads and draw a street that starts on the highway.",
  "adv.zoneHomes": "Good road! Now pick Zones and paint Houses along it. People will build homes there by themselves.",
  "adv.zoneJobs": "People need work and shops. Paint some Shops, and Industry a little away from the homes: factories smoke.",
  "adv.power": "The buildings have no power. Build a wind turbine or a coal power plant next to a road. Power runs along the roads.",
  "adv.morePower": "There is not enough power for everyone. Build more power plants.",
  "adv.grow": "It works! Keep adding streets and zones. Watch the bars at the top: they show what the city wants more of.",
  "adv.water": "Your town needs water now. Build a water pump and a sewage outlet near the water, or a water tower and a septic tank anywhere. Pipes run along the roads.",
  "adv.moreWater": "Water is running short. Build another pump or water tower.", "adv.sewage": "The sewers are full. Build another sewage outlet, septic tank or a treatment plant.",
  "adv.services": "People now ask for a clinic and a school. And rubbish piles up: build a landfill, away from the homes.",
  "adv.safety": "A police station and a fire station keep the town safe. Without a fire station, fires burn buildings down.",
  "adv.unhappy": "People are unhappy. Look at Views to see what is missing: parks, health, less pollution or noise.",
  "adv.jobs": "Many people have no work. Zone more shops, industry or offices.", "adv.workers": "Businesses can't find workers. Zone more homes.",
  "adv.traffic": "Traffic is jammed. Turn busy streets into avenues, add more ways through, or start a bus line.",
  "adv.money": "The city is losing money. Open Money: raise taxes a little, lower a budget, or zone more.",
  "adv.noDemand": "Nobody wants to move in right now. Check the bars at the top, and make sure homes have jobs and shops nearby.",
  "adv.highway": "Some roads don't lead to the highway. Nothing can grow there.", "adv.transit": "Bus lines are unlocked. Build a bus depot, then draw a line through busy areas.",
  "adv.edu": "With a high school, people can work in offices. Offices pay good taxes and are clean.",
  "adv.farms": "Farms and forestry are unlocked. Look at Views to find fertile land and forest. Local materials make factories earn more.",
  "adv.flood": "Careful with low land by the water: it floods in storms. The view Flood danger shows where.",
  "adv.chill": "Chill mode: money never runs out and everything is unlocked. Build whatever you like!",
  "adv.fine": "The city is doing well. Keep growing!", "adv.hide": "Hide", "adv.gotIt": "Got it",

  // ---- help
  "help.camera": "Moving around",
  "help.camera.mouse": "Drag with the left mouse button to move, with the right button to turn and tilt, and use the wheel to zoom. Or the keys W A S D, Q E, R F, + and -.",
  "help.camera.touch": "Drag with one finger to move (with Look selected), or with two fingers at any time. Pinch to zoom, twist to turn.",
  "help.roads": "Roads", "help.roads.t": "Everything stands along roads, and roads have to lead to the highway. Draw straight roads or curves; roads over water become bridges. Power, water and sewage run along roads by themselves.",
  "help.zones": "Zones", "help.zones.t": "Paint zones along roads: homes, shops, industry, later offices. Buildings grow when the city wants them (the bars at the top) and get better when the area is nice.",
  "help.services": "Services", "help.services.t": "Schools, clinics, police, fire stations and parks reach the plots around them. The views show how far.",
  "help.traffic": "Traffic", "help.traffic.t": "Every car drives from a real home to a real job or shop. Jams make people unhappy and businesses poorer. Avenues, more connections, buses and the metro help.",
  "help.money": "Money", "help.money.t": "Taxes come in from people and businesses; roads and services cost upkeep. If things get tight: raise taxes a little, lower budgets, or take a loan.",
  "help.modes": "Modes", "help.keys": "Keys", "help.keys.t": "Space: pause · 1 2 3: speed · Esc: cancel · B: bulldozer",
};
