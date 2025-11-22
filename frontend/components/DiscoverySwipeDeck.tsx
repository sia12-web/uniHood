"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";

import type { NearbyUser } from "@/lib/types";

type SwipeDirection = "left" | "right";

type Props = {
  className?: string;
};

type DemoProfile = NearbyUser & {
  university: string;
  degree: string;
  year: string;
  passions: string[];
  promptQuestion: string;
  promptAnswer: string;
  images: string[];
};

const DEMO_PROFILES: DemoProfile[] = [
  {
    user_id: "demo-1",
    display_name: "Sarah Chen",
    handle: "sarahc",
    major: "Computer Science",
    university: "Stanford University",
    degree: "B.S.",
    year: "Junior",
    passions: ["Coding", "Hiking", "Photography"],
    promptQuestion: "My simple pleasure is...",
    promptAnswer: "Debugging code at 3 AM with a fresh cup of coffee.",
    images: [
      "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=800&auto=format&fit=crop&q=60",
      "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=800&auto=format&fit=crop&q=60",
      "https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=800&auto=format&fit=crop&q=60"
    ]
  },
  {
    user_id: "demo-2",
    display_name: "Marcus Johnson",
    handle: "marcusj",
    major: "Business Administration",
    university: "Wharton School",
    degree: "MBA",
    year: "1st Year",
    passions: ["Startups", "Basketball", "Investing"],
    promptQuestion: "I'm overly competitive about...",
    promptAnswer: "Monopoly. I will not hesitate to bankrupt my own grandmother.",
    images: [
      "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=800&auto=format&fit=crop&q=60",
      "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=800&auto=format&fit=crop&q=60",
      "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=800&auto=format&fit=crop&q=60"
    ]
  },
  {
    user_id: "demo-3",
    display_name: "Emily Davis",
    handle: "emilyd",
    major: "Psychology",
    university: "NYU",
    degree: "B.A.",
    year: "Senior",
    passions: ["Art Galleries", "Coffee", "Yoga"],
    promptQuestion: "Best travel story...",
    promptAnswer: "Got lost in Tokyo for 6 hours and found the best ramen shop ever.",
    images: [
      "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=800&auto=format&fit=crop&q=60",
      "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=800&auto=format&fit=crop&q=60",
      "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=800&auto=format&fit=crop&q=60"
    ]
  },
  {
    user_id: "demo-4",
    display_name: "Alex Kim",
    handle: "alexk",
    major: "Mechanical Engineering",
    university: "MIT",
    degree: "M.S.",
    year: "Grad",
    passions: ["Robotics", "Sci-Fi", "Rock Climbing"],
    promptQuestion: "A random fact I love is...",
    promptAnswer: "Wombat poop is cube-shaped.",
    images: [
      "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=800&auto=format&fit=crop&q=60",
      "https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?w=800&auto=format&fit=crop&q=60",
      "https://images.unsplash.com/photo-1504257432389-52343af06ae3?w=800&auto=format&fit=crop&q=60"
    ]
  },
  {
    user_id: "demo-5",
    display_name: "Jessica Wong",
    handle: "jessw",
    major: "Graphic Design",
    university: "RISD",
    degree: "B.F.A.",
    year: "Sophomore",
    passions: ["Typography", "Sketching", "Indie Music"],
    promptQuestion: "My ideal Sunday...",
    promptAnswer: "Thrifting, bubble tea, and designing posters.",
    images: [
      "https://images.unsplash.com/photo-1517365830460-955ce3ccd263?w=800&auto=format&fit=crop&q=60",
      "https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?w=800&auto=format&fit=crop&q=60",
      "https://images.unsplash.com/photo-1488426862026-3ee34a7d66df?w=800&auto=format&fit=crop&q=60"
    ]
  },
  {
    user_id: "demo-6",
    display_name: "David Miller",
    handle: "davidm",
    major: "Pre-med",
    university: "Johns Hopkins",
    degree: "B.S.",
    year: "Junior",
    passions: ["Volunteering", "Running", "Cooking"],
    promptQuestion: "I'm looking for...",
    promptAnswer: "Someone to study anatomy with (strictly academic, of course).",
    images: [
      "https://images.unsplash.com/photo-1480455624313-e29b44bbfde1?w=800&auto=format&fit=crop&q=60",
      "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=800&auto=format&fit=crop&q=60",
      "https://images.unsplash.com/photo-1531427186611-ecfd6d936c79?w=800&auto=format&fit=crop&q=60"
    ]
  },
  {
    user_id: "demo-7",
    display_name: "Olivia Wilson",
    handle: "oliviaw",
    major: "English Literature",
    university: "Oxford",
    degree: "B.A.",
    year: "Senior",
    passions: ["Poetry", "Tea", "Vintage Books"],
    promptQuestion: "My favorite quote...",
    promptAnswer: "“Whatever our souls are made of, his and mine are the same.”",
    images: [
      "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=800&auto=format&fit=crop&q=60",
      "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=800&auto=format&fit=crop&q=60",
      "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=800&auto=format&fit=crop&q=60"
    ]
  },
  {
    user_id: "demo-8",
    display_name: "Ryan Taylor",
    handle: "ryant",
    major: "Economics",
    university: "LSE",
    degree: "B.S.",
    year: "Grad",
    passions: ["Finance", "Soccer", "Travel"],
    promptQuestion: "Two truths and a lie...",
    promptAnswer: "I've been to 30 countries. I can fly a plane. I hate pizza.",
    images: [
      "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=800&auto=format&fit=crop&q=60",
      "https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?w=800&auto=format&fit=crop&q=60",
      "https://images.unsplash.com/photo-1504257432389-52343af06ae3?w=800&auto=format&fit=crop&q=60"
    ]
  },
  {
    user_id: "demo-9",
    display_name: "Sophia Anderson",
    handle: "sophiaa",
    major: "Architecture",
    university: "Cornell",
    degree: "B.Arch",
    year: "5th Year",
    passions: ["Design", "Urban Planning", "Sketching"],
    promptQuestion: "I geek out on...",
    promptAnswer: "Brutalist architecture and sustainable materials.",
    images: [
      "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=800&auto=format&fit=crop&q=60",
      "https://images.unsplash.com/photo-1488426862026-3ee34a7d66df?w=800&auto=format&fit=crop&q=60",
      "https://images.unsplash.com/photo-1517365830460-955ce3ccd263?w=800&auto=format&fit=crop&q=60"
    ]
  },
  {
    user_id: "demo-10",
    display_name: "Daniel Thomas",
    handle: "danielt",
    major: "Music Performance",
    university: "Juilliard",
    degree: "B.Mus",
    year: "Senior",
    passions: ["Cello", "Jazz", "Opera"],
    promptQuestion: "My shower song is...",
    promptAnswer: "Bohemian Rhapsody. All the parts.",
    images: [
      "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=800&auto=format&fit=crop&q=60",
      "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=800&auto=format&fit=crop&q=60",
      "https://images.unsplash.com/photo-1480455624313-e29b44bbfde1?w=800&auto=format&fit=crop&q=60"
    ]
  },
  {
    user_id: "demo-11",
    display_name: "Isabella Martinez",
    handle: "isabellam",
    major: "Law",
    university: "Harvard",
    degree: "J.D.",
    year: "2nd Year",
    passions: ["Debate", "Politics", "Salsa Dancing"],
    promptQuestion: "Don't hate me if I...",
    promptAnswer: "Correct your grammar. It's an occupational hazard.",
    images: [
      "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=800&auto=format&fit=crop&q=60",
      "https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?w=800&auto=format&fit=crop&q=60",
      "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=800&auto=format&fit=crop&q=60"
    ]
  },
  {
    user_id: "demo-12",
    display_name: "William Jackson",
    handle: "williamj",
    major: "History",
    university: "Yale",
    degree: "Ph.D.",
    year: "Candidate",
    passions: ["Museums", "Archery", "Classic Rock"],
    promptQuestion: "If I could time travel...",
    promptAnswer: "I'd go to ancient Rome. Just to see the Colosseum in its prime.",
    images: [
      "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=800&auto=format&fit=crop&q=60",
      "https://images.unsplash.com/photo-1504257432389-52343af06ae3?w=800&auto=format&fit=crop&q=60",
      "https://images.unsplash.com/photo-1531427186611-ecfd6d936c79?w=800&auto=format&fit=crop&q=60"
    ]
  },
  {
    user_id: "demo-13",
    display_name: "Mia White",
    handle: "miaw",
    major: "Marine Biology",
    university: "UCSD",
    degree: "B.S.",
    year: "Junior",
    passions: ["Surfing", "Ocean Conservation", "Scuba"],
    promptQuestion: "My happy place...",
    promptAnswer: "Underwater, 30 feet deep, watching sea turtles.",
    images: [
      "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=800&auto=format&fit=crop&q=60",
      "https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=800&auto=format&fit=crop&q=60",
      "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=800&auto=format&fit=crop&q=60"
    ]
  },
  {
    user_id: "demo-14",
    display_name: "James Harris",
    handle: "jamesh",
    major: "Physics",
    university: "Caltech",
    degree: "B.S.",
    year: "Senior",
    passions: ["Astronomy", "Chess", "Video Games"],
    promptQuestion: "I spend too much time...",
    promptAnswer: "Thinking about the heat death of the universe.",
    images: [
      "https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?w=800&auto=format&fit=crop&q=60",
      "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=800&auto=format&fit=crop&q=60",
      "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=800&auto=format&fit=crop&q=60"
    ]
  },
  {
    user_id: "demo-15",
    display_name: "Charlotte Martin",
    handle: "charlottem",
    major: "Chemistry",
    university: "Berkeley",
    degree: "B.S.",
    year: "Sophomore",
    passions: ["Baking", "Hiking", "Pottery"],
    promptQuestion: "The way to my heart is...",
    promptAnswer: "Through a perfectly baked sourdough loaf.",
    images: [
      "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=800&auto=format&fit=crop&q=60",
      "https://images.unsplash.com/photo-1488426862026-3ee34a7d66df?w=800&auto=format&fit=crop&q=60",
      "https://images.unsplash.com/photo-1517365830460-955ce3ccd263?w=800&auto=format&fit=crop&q=60"
    ]
  },
  {
    user_id: "demo-16",
    display_name: "Benjamin Thompson",
    handle: "benjamint",
    major: "Mathematics",
    university: "Princeton",
    degree: "B.A.",
    year: "Junior",
    passions: ["Puzzles", "Piano", "Running"],
    promptQuestion: "I'm secretly good at...",
    promptAnswer: "Solving a Rubik's cube in under a minute.",
    images: [
      "https://images.unsplash.com/photo-1480455624313-e29b44bbfde1?w=800&auto=format&fit=crop&q=60",
      "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=800&auto=format&fit=crop&q=60",
      "https://images.unsplash.com/photo-1531427186611-ecfd6d936c79?w=800&auto=format&fit=crop&q=60"
    ]
  },
  {
    user_id: "demo-17",
    display_name: "Amelia Garcia",
    handle: "ameliag",
    major: "Political Science",
    university: "Georgetown",
    degree: "B.A.",
    year: "Senior",
    passions: ["Activism", "Coffee", "Documentaries"],
    promptQuestion: "Change my mind about...",
    promptAnswer: "Pineapple on pizza. It's actually good.",
    images: [
      "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=800&auto=format&fit=crop&q=60",
      "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=800&auto=format&fit=crop&q=60",
      "https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?w=800&auto=format&fit=crop&q=60"
    ]
  },
  {
    user_id: "demo-18",
    display_name: "Lucas Robinson",
    handle: "lucasr",
    major: "Philosophy",
    university: "Columbia",
    degree: "B.A.",
    year: "Junior",
    passions: ["Reading", "Cycling", "Film Noir"],
    promptQuestion: "Let's debate...",
    promptAnswer: "Free will vs. determinism. Over coffee.",
    images: [
      "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=800&auto=format&fit=crop&q=60",
      "https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?w=800&auto=format&fit=crop&q=60",
      "https://images.unsplash.com/photo-1504257432389-52343af06ae3?w=800&auto=format&fit=crop&q=60"
    ]
  },
  {
    user_id: "demo-19",
    display_name: "Harper Clark",
    handle: "harperc",
    major: "Sociology",
    university: "UChicago",
    degree: "B.A.",
    year: "Sophomore",
    passions: ["People Watching", "Thrifting", "Podcasts"],
    promptQuestion: "I'm obsessed with...",
    promptAnswer: "True crime podcasts. I've listened to them all.",
    images: [
      "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=800&auto=format&fit=crop&q=60",
      "https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=800&auto=format&fit=crop&q=60",
      "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=800&auto=format&fit=crop&q=60"
    ]
  },
  {
    user_id: "demo-20",
    display_name: "Ethan Lewis",
    handle: "ethanl",
    major: "Environmental Science",
    university: "UW",
    degree: "B.S.",
    year: "Senior",
    passions: ["Hiking", "Camping", "Sustainability"],
    promptQuestion: "My goal this year...",
    promptAnswer: "Visit 5 national parks.",
    images: [
      "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=800&auto=format&fit=crop&q=60",
      "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=800&auto=format&fit=crop&q=60",
      "https://images.unsplash.com/photo-1480455624313-e29b44bbfde1?w=800&auto=format&fit=crop&q=60"
    ]
  }
];

export default function DiscoverySwipeDeck({ className }: Props) {
  const [authReady, setAuthReady] = useState(false);
  const [users, setUsers] = useState<DemoProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [imageIndex, setImageIndex] = useState(0);
  const animatingRef = useRef(false);

  const loadFeed = useCallback(
    async () => {
      // For demo purposes, we always load the demo profiles
      setLoading(true);
      setError(null);
      
      // Simulate network delay
      await new Promise(resolve => setTimeout(resolve, 800));
      
      setUsers(DEMO_PROFILES);
      setActiveIndex(0);
      setImageIndex(0);
      setLoading(false);
      setAuthReady(true);
    },
    [],
  );

  useEffect(() => {
    void loadFeed();
  }, [loadFeed]);

  const activeCard = users[activeIndex] ?? null;
  const currentImage = activeCard?.images[imageIndex % activeCard.images.length];

  const handleImageClick = useCallback(() => {
    setImageIndex((prev) => prev + 1);
  }, []);

  const handleSwipe = useCallback(
    async (direction: SwipeDirection) => {
      if (animatingRef.current) return;
      if (!activeCard) return;
      animatingRef.current = true;
      try {
        // In demo mode, we just log or skip the API call
        console.log(`Swiped ${direction} on ${activeCard.display_name}`);
      } catch {
        // best-effort; keep UI responsive
      } finally {
        const nextIndex = activeIndex + 1;
        if (nextIndex >= users.length) {
          // Reset for demo loop
          setActiveIndex(0);
        } else {
          setActiveIndex(nextIndex);
        }
        setImageIndex(0); // Reset image index for new card
        animatingRef.current = false;
      }
    },
    [activeCard, activeIndex, users.length],
  );

  if (!authReady && loading) {
    return (
      <div className={`flex h-[600px] items-center justify-center rounded-3xl border border-slate-200 bg-white/90 p-6 text-sm text-slate-600 shadow-sm ${className ?? ""}`}>
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-rose-500 border-t-transparent" />
          <p>Finding students nearby...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`rounded-3xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 shadow-sm ${className ?? ""}`}>
        {error}
      </div>
    );
  }

  if (!activeCard) {
    return (
      <div className={`rounded-3xl border border-slate-200 bg-white/90 p-6 text-sm text-slate-600 shadow-sm ${className ?? ""}`}>
        {loading ? "Loading discovery..." : "No more people to discover right now."}
      </div>
    );
  }

  const infoStep = imageIndex % 3;

  return (
    <div
      className={`flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white/95 p-5 shadow-sm ${className ?? ""}`}
      role="region"
      aria-label="Discovery swipe deck"
    >
      <div className="flex items-center justify-between text-xs uppercase tracking-[0.3em] text-slate-500">
        <span>Discovery</span>
        <span>{activeIndex + 1} / {users.length}</span>
      </div>

      {/* Card Container */}
      <div 
        className="relative flex h-[450px] flex-col overflow-hidden rounded-3xl bg-slate-900 text-white shadow-lg transition-all active:scale-[0.98]"
        onClick={handleImageClick}
      >
        {/* Image Layer */}
        <div className="absolute inset-0">
          {currentImage && (
            <Image 
              src={currentImage} 
              alt={activeCard.display_name} 
              fill 
              className="object-cover transition-opacity duration-300"
              priority
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-black/80" />
          
          {/* Tap indicators */}
          <div className="absolute top-2 left-2 right-2 flex gap-1">
            {activeCard.images.map((_, idx) => (
              <div 
                key={idx} 
                className={`h-1 flex-1 rounded-full transition-colors ${
                  idx === imageIndex % activeCard.images.length ? "bg-white" : "bg-white/30"
                }`} 
              />
            ))}
          </div>
        </div>

        {/* Info Layer - Changes based on tap */}
        <div className="relative z-10 mt-auto p-6">
          {infoStep === 0 && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
              <h2 className="text-3xl font-bold">{activeCard.display_name}, {activeCard.year}</h2>
              <p className="mt-1 text-lg font-medium text-white/90">{activeCard.university}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="rounded-full bg-white/20 px-3 py-1 text-sm backdrop-blur-md">
                  {activeCard.major}
                </span>
                <span className="rounded-full bg-white/20 px-3 py-1 text-sm backdrop-blur-md">
                  {activeCard.degree}
                </span>
              </div>
            </div>
          )}

          {infoStep === 1 && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
              <h3 className="text-sm font-bold uppercase tracking-widest text-rose-300">Passions</h3>
              <div className="mt-3 flex flex-wrap gap-2">
                {activeCard.passions.map((passion) => (
                  <span key={passion} className="rounded-full border border-white/40 bg-black/20 px-4 py-2 text-sm font-medium backdrop-blur-md">
                    {passion}
                  </span>
                ))}
              </div>
            </div>
          )}

          {infoStep === 2 && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
                <div className="rounded-2xl bg-white/10 p-4 backdrop-blur-md">
                  <p className="text-xs font-bold uppercase tracking-widest text-rose-300">{activeCard.promptQuestion}</p>
                <p className="mt-2 text-xl font-medium leading-relaxed">&ldquo;{activeCard.promptAnswer}&rdquo;</p>
                </div>
              </div>
            )}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); void handleSwipe("left"); }}
          className="flex-1 rounded-2xl border border-slate-200 px-4 py-4 text-sm font-bold uppercase tracking-widest text-rose-500 shadow-sm transition hover:border-rose-300 hover:bg-rose-50"
        >
          Pass
        </button>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); void handleSwipe("right"); }}
          className="flex-1 rounded-2xl bg-gradient-to-r from-rose-500 to-pink-600 px-4 py-4 text-sm font-bold uppercase tracking-widest text-white shadow-lg transition hover:from-rose-600 hover:to-pink-700"
        >
          Like
        </button>
      </div>
    </div>
  );
}
