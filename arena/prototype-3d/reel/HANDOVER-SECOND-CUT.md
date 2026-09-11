# Second-cut handover

The tactical engine is two-sided. `createBattleFromFleets` destructures `[A,B]`,
assigns side A/B, and `stepTurn` uses that partition for opponents and missile
defenders. It cannot execute the box's advertised 2–4-player free-for-all without
an engine-level decision. This slice changes neither the engine nor game data.
Please route multiplayer hostility, initiative, victory and defence-pool semantics
to the tactical-engine owner. The reel's explicit hostility graph is not an
implementation of that feature.

The second cut follows Fable's revised standard: individual canonical rules,
real compiled stock mounts, no forced random outcomes. An offline read-only
adapter exposes unchanged private functions in memory. The chosen action order
is Swift, Victory, Point; it is not claimed to be a three-way initiative result.

Point's green crystals are real weapon features, but their exact heavy-blaster,
missile and PD assignments remain nearest honest attachments, not confirmed
anatomy. Victory's separate PD battery is likewise unconfirmed; the existing
forward weapon location supplies its tracer origin. Swift's smaller dome is a
confirmed point-defence emitter. No asset, schematic or socket was invented here.

The engine abstracts interception to a next-turn roll, without a projectile
collision coordinate or individual battery selection. The reel illustrates the
successful result 32 mm short of the target hull. Tracer count, stand-off and
continuous presentation timing have no rules authority.

Source hulls, prepared derivatives, approved bases/posts/crystals, furniture and
the shared camera contract remain unchanged. The earlier 20/100 planning-height
rim-code/facing-marker findings still stand; this cut scores effect readability.
No destruction, planet/nebula sample, full-board test, permanent asset intake,
commit or branch is included.
