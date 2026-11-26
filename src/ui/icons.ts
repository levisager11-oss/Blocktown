// The icons of the interface: one line-drawn set (Lucide, ISC licence), so every button looks alike on every phone.
import {
  Ambulance, Axe, Backpack, BookOpen, Briefcase, Building, Building2, Car, ChevronsDown, ChevronsUp, CircleAlert, Cloud, CloudFog, CloudLightning, CloudRain, CloudSnow,
  Coins, Construction, Database, Dices, Droplet, Droplets, Eraser, Factory, FerrisWheel, Filter, FireExtinguisher, Flame, Flower, Flower2, FolderOpen, Frown, Fuel, Gem,
  Ghost, GraduationCap, Hammer, HeartPulse, Hospital, House, LandPlot, Landmark, Laugh, Layers, Leaf, List, Lock, MapPin, Maximize, Meh, Minus, MousePointerClick, Pickaxe,
  Play, Plus, Radiation, Recycle, RotateCcw, RotateCw, Route, Save, School, Settings, Shield, ShoppingBag, Siren, Smile, Snowflake, Sparkles, Sprout, Stethoscope, Store, Sun,
  Toilet, TrainFront, TrainFrontTunnel, Trash2, TreeDeciduous, TreePalm, TreePine, Trees, Trophy, UserRound, Users, Volume2, Waves, Wheat, Wind, X, Zap, ZapOff, BusFront, Bus,
} from "lucide-static";

const SET = {
  ambulance: Ambulance, axe: Axe, backpack: Backpack, book: BookOpen, briefcase: Briefcase, building: Building, buildings: Building2, car: Car, down: ChevronsDown, up: ChevronsUp,
  alert: CircleAlert, cloud: Cloud, fog: CloudFog, storm: CloudLightning, rain: CloudRain, snow: CloudSnow, coins: Coins, roadwork: Construction, tank: Database, dice: Dices,
  drop: Droplet, drops: Droplets, eraser: Eraser, factory: Factory, wheel: FerrisWheel, filter: Filter, extinguisher: FireExtinguisher, flame: Flame, flower: Flower, flower2: Flower2,
  folder: FolderOpen, frown: Frown, fuel: Fuel, gem: Gem, ghost: Ghost, cap: GraduationCap, hammer: Hammer, health: HeartPulse, hospital: Hospital, house: House, plot: LandPlot,
  landmark: Landmark, laugh: Laugh, layers: Layers, leaf: Leaf, list: List, lock: Lock, pin: MapPin, maximize: Maximize, meh: Meh, minus: Minus, pointer: MousePointerClick,
  pickaxe: Pickaxe, play: Play, plus: Plus, radiation: Radiation, recycle: Recycle, ccw: RotateCcw, cw: RotateCw, route: Route, save: Save, school: School, settings: Settings,
  shield: Shield, bag: ShoppingBag, siren: Siren, smile: Smile, snowflake: Snowflake, sparkles: Sparkles, sprout: Sprout, stethoscope: Stethoscope, store: Store, sun: Sun,
  toilet: Toilet, train: TrainFront, metro: TrainFrontTunnel, trash: Trash2, tree: TreeDeciduous, palm: TreePalm, pine: TreePine, trees: Trees, trophy: Trophy, user: UserRound,
  users: Users, sound: Volume2, waves: Waves, wheat: Wheat, wind: Wind, x: X, zap: Zap, zapOff: ZapOff, busFront: BusFront, bus: Bus,
};
export type IconName = keyof typeof SET;

const clean = new Map<IconName, string>();
/** The drawing as markup, sized by the font size of where it goes. */
export function iconSvg(name: IconName): string {
  let s = clean.get(name);
  if (!s) {
    s = SET[name].replace(/<!--[\s\S]*?-->/, "").replace(/\s(width|height)="24"/g, "").replace(/\sclass="[^"]*"/, ' class="i" aria-hidden="true" focusable="false"').trim();
    clean.set(name, s);
  }
  return s;
}
/** An icon as an element: icon("house"). */
export function icon(name: IconName, cls = ""): HTMLElement {
  const el = document.createElement("span");
  el.className = "ic" + (cls ? " " + cls : "");
  el.innerHTML = iconSvg(name);
  return el;
}
/** An icon on a coloured tile, as the tools show them. */
export function tile(name: IconName, color: string, cls = ""): HTMLElement {
  const el = icon(name, "tile" + (cls ? " " + cls : ""));
  el.style.setProperty("--c", color);
  return el;
}

/** The buildings, by their key in the game data. */
export const BUILDING_ICON: Record<string, IconName> = {
  wind: "wind", coal: "factory", solar: "sun", nuclear: "radiation",
  pump: "drops", tower: "tank", outlet: "waves", septic: "toilet", treatment: "filter",
  landfill: "trash", recycling: "recycle", incinerator: "flame",
  police: "shield", policeHq: "landmark", fire: "extinguisher", fireHq: "siren",
  clinic: "stethoscope", hospital: "hospital",
  school: "school", highSchool: "backpack", university: "cap",
  park: "tree", playground: "wheel", plaza: "flower2", bigPark: "trees", stadium: "trophy",
  busDepot: "bus", metro: "metro",
};
/** Colours of the kinds of buildings. */
export const CAT_COLOR: Record<string, string> = {
  power: "#f5c542", water: "#4fa9ef", garbage: "#a3b18a", police: "#6c8cff", fire: "#ff6b5b", health: "#ff7a9a", edu: "#b18cff", parks: "#5fd068", transit: "#ff9f43",
};
/** The zones, in the order of the game data (none first). */
export const ZONE_ICON: IconName[] = ["x", "house", "building", "store", "bag", "factory", "briefcase", "wheat", "axe", "pickaxe", "fuel"];
