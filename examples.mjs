export const examples = {
  hello: `main(): Void {
  print("Hello, browser!")
}
`,
  exact: `main(): Void {
  third = 1/3
  print((third * 30).nat())
  print((1/8).dec())
}
`,
  pure: `pure square(n: Nat): Nat {
  n * n
}

main(): Void {
  print(square(12))
}
`,
  text: `main(): Void {
  print("hello.panack".ends_with(".panack"))
}
`,
  invoice: `// Exact decimals keep every cent in this calculation.
pure with_tax(subtotal: Dec, rate: Dec): Dec {
  subtotal * (1.0 + rate)
}

main(): Void {
  notebooks = 3.0 * 19.95
  pens = 2.0 * 3.75
  subtotal = notebooks + pens
  tax_rate = 0.20
  tax = subtotal * tax_rate
  total = with_tax(subtotal, tax_rate)
  print("Subtotal: \${subtotal}")
  print("Tax: \${tax}")
  print("Total: \${total}")
}
`,
  guards: `type Seats = Int where value > 0 && value <= 8

pure ticket_total(count: Seats): Int {
  count * 15
}

main(): Void {
  seats: Seats = 4
  total = ticket_total(seats)
  print("Seats: \${seats}")
  print("Ticket total: \${total}")
}
`,
  collections: `pure add_bonus(score: Nat): Nat { score + 5 }
pure lower_first(left: Nat, right: Nat): Bool { left < right }

main(): Void {
  scores: [Nat] = [80, 35, 60, 90, 50]
  mut passing: [Nat] = []
  for score in scores {
    if score >= 50 { passing = passing.append(score) }
  }
  boosted = passing.map(@add_bonus)
  ordered = boosted.sort_by(@lower_first)
  print("Passing scores with bonus:")
  for score in ordered { print(score) }
}
`,
  results: `pure greeting(name: Option[Str]): Str {
  match name {
    Some(value) => "Hello, \${value}",
    None() => "Hello, guest"
  }
}

pure safe_divide(n: Nat, d: Nat): Result[Nat,Str] {
  if d == 0 { Error("Cannot divide by zero") }
  else { Ok(quotient(n, d)) }
}

pure describe(result: Result[Nat,Str]): Str {
  match result {
    Ok(value) => "Answer: \${value}",
    Error(message) => message
  }
}

main(): Void {
  print(greeting(Some("Ada")))
  print(greeting(None()))
  print(describe(safe_divide(84, 2)))
  print(describe(safe_divide(10, 0)))
}
`,
  order: `type Quantity = Int where value > 0

record Line {
  name: Str,
  quantity: Quantity,
  unit_price: Dec
}

pure line_total(line: Line): Dec {
  // Convert the integer through an exact rational to a decimal.
  (line.quantity / 1).dec() * line.unit_price
}

pure order_total(lines: [Line]): Dec {
  mut total: Dec = 0.0
  for line in lines { total = total + line_total(line) }
  total
}

main(): Void {
  lines: [Line] = [
    Line("Notebook", 3, 19.95),
    Line("Pen", 2, 3.75)
  ]
  print("Order summary")
  for line in lines {
    name = line.name
    quantity = line.quantity
    total = line_total(line)
    print("\${name} x \${quantity}: \${total}")
  }
  subtotal = order_total(lines)
  tax = subtotal * 0.20
  print("Subtotal: \${subtotal}")
  print("Tax: \${tax}")
  total = subtotal + tax
  print("Total: \${total}")
}
`,
};

export const exampleGuides = {
  "hello": {
    "title": "Hello, browser",
    "description": "A complete program starts in main. print writes a line to the output.",
    "edit": "Replace the greeting with your own message.",
    "expected": "Hello, browser!\n"
  },
  "exact": {
    "title": "Exact arithmetic",
    "description": "Fractions stay exact. Decimal conversion requires an exactly representable value.",
    "edit": "Change (1/8).dec() to (1/3).dec() and inspect the conversion failure.",
    "expected": "10\n0.125\n"
  },
  "pure": {
    "title": "Pure functions",
    "description": "A pure function calculates without I/O. The entry point prints its result.",
    "edit": "Change square(12) to square(25), or try print inside the pure function.",
    "expected": "144\n"
  },
  "text": {
    "title": "Standard library",
    "description": "Text values provide methods directly. Check a filename suffix without an import.",
    "edit": "Change hello.panack to hello.txt and run again.",
    "expected": "true\n"
  },
  "invoice": {
    "title": "An exact invoice",
    "description": "Calculate line totals and tax with exact decimal arithmetic. Pure calculations are separate from printing; decimal output is a value, not fixed-width currency formatting.",
    "edit": "Change the notebook quantity from 3.0 to 4.0 and check how subtotal, tax and total change.",
    "expected": "Subtotal: 67.350\nTax: 13.47000\nTotal: 80.82000\n"
  },
  "guards": {
    "title": "Validated domain values",
    "description": "A guarded type gives a business rule a name. Functions accepting Seats state that the count must be between 1 and 8.",
    "edit": "Change the Seats value from 4 to 0 or 9, then run to see the rejected value. Restore 4 to recover.",
    "expected": "Seats: 4\nTicket total: 60\n"
  },
  "collections": {
    "title": "Filter, transform and sort",
    "description": "Build a filtered array with a loop, transform it with a named pure function, and sort the results without changing the original input.",
    "edit": "Change the minimum score from 50 to 70, or add another score to the input array.",
    "expected": "Passing scores with bonus:\n55\n65\n85\n95\n"
  },
  "results": {
    "title": "Success, absence and failure",
    "description": "Option represents a possibly missing value; Result represents a calculation that can fail. Pattern matching handles each case explicitly.",
    "edit": "Change safe_divide(10, 0) to safe_divide(10, 2), or change the fallback guest name.",
    "expected": "Hello, Ada\nHello, guest\nAnswer: 42\nCannot divide by zero\n"
  },
  "order": {
    "title": "A complete order summary",
    "description": "Combine a guarded quantity, records, an array of order lines, pure calculations and formatted output. Each line keeps its name, quantity and price together.",
    "edit": "Add another Line to the array, or change a quantity. Set a quantity to 0 to try the domain constraint.",
    "expected": "Order summary\nNotebook x 3: 59.85\nPen x 2: 7.50\nSubtotal: 67.35\nTax: 13.4700\nTotal: 80.8200\n"
  }
};
