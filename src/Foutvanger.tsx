import { Component, type ReactNode } from 'react'

// Laat een foutmelding zien in plaats van een leeg scherm als een pagina vastloopt.
// Geef hem het pad als key, zodat een andere pagina weer gewoon opent.
export default class Foutvanger extends Component<{ children: ReactNode }, { fout: Error | null }> {
  state = { fout: null as Error | null }

  static getDerivedStateFromError(fout: Error) {
    return { fout }
  }

  render() {
    if (!this.state.fout) return this.props.children
    return (
      <main className="pagina smal">
        <h1>Er ging iets mis</h1>
        <p>Deze pagina kon niet worden getoond. Stuur de foutmelding hieronder door, dan lossen we het op.</p>
        <p className="notitie klein">{this.state.fout.message}</p>
        <div className="formulier">
          <button onClick={() => window.location.reload()}>Opnieuw proberen</button>
        </div>
      </main>
    )
  }
}
