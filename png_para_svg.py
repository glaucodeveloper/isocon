#!/usr/bin/env python3

from __future__ import annotations

import argparse
import sys
import tempfile
from pathlib import Path

import vtracer
from PIL import Image


def preparar_png(
    entrada: Path,
    saida_temporaria: Path,
    recortar: bool,
    alpha_minimo: int,
) -> None:
    imagem = Image.open(entrada).convert("RGBA")

    pixels = list(imagem.getdata())
    pixels_limpos = []

    for vermelho, verde, azul, alpha in pixels:
        if alpha <= alpha_minimo:
            pixels_limpos.append((0, 0, 0, 0))
        else:
            pixels_limpos.append((vermelho, verde, azul, alpha))

    imagem.putdata(pixels_limpos)

    if recortar:
        canal_alpha = imagem.getchannel("A")
        limite = canal_alpha.getbbox()

        if limite is None:
            raise ValueError("A imagem está completamente transparente.")

        imagem = imagem.crop(limite)

    imagem.save(saida_temporaria, format="PNG")


def vetorizar(
    entrada: Path,
    saida: Path,
    recortar: bool = True,
    alpha_minimo: int = 8,
) -> None:
    if not entrada.exists():
        raise FileNotFoundError(f"Arquivo não encontrado: {entrada}")

    if entrada.suffix.lower() != ".png":
        raise ValueError("O arquivo de entrada deve ser PNG.")

    saida.parent.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory(prefix="png-svg-") as pasta:
        png_preparado = Path(pasta) / "imagem_preparada.png"

        preparar_png(
            entrada=entrada,
            saida_temporaria=png_preparado,
            recortar=recortar,
            alpha_minimo=alpha_minimo,
        )

        vtracer.convert_image_to_svg_py(
            str(png_preparado),
            str(saida),

            # Vetorização colorida
            colormode="color",

            # Formas empilhadas, adequado para logos
            hierarchical="stacked",

            # Curvas suaves em vez de polígonos rígidos
            mode="spline",

            # Remove pequenos ruídos
            filter_speckle=2,

            # Precisão das cores: 1 a 8
            color_precision=7,

            # Menor valor preserva mais variações de cor
            layer_difference=8,

            # Conserva cantos da tipografia e do símbolo
            corner_threshold=60,

            # Ajustes das curvas
            length_threshold=4.0,
            max_iterations=10,
            splice_threshold=45,

            # Casas decimais das coordenadas SVG
            path_precision=4,
        )

    print(f"SVG criado: {saida.resolve()}")


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Converte PNG em SVG vetorial usando VTracer."
    )

    parser.add_argument(
        "entrada",
        type=Path,
        help="Arquivo PNG de entrada.",
    )

    parser.add_argument(
        "saida",
        type=Path,
        nargs="?",
        help="Arquivo SVG de saída. Por padrão usa o mesmo nome do PNG.",
    )

    parser.add_argument(
        "--sem-recorte",
        action="store_true",
        help="Mantém as dimensões e margens transparentes originais.",
    )

    parser.add_argument(
        "--alpha-minimo",
        type=int,
        default=8,
        help="Pixels com alpha abaixo deste valor serão removidos. Padrão: 8.",
    )

    argumentos = parser.parse_args()

    entrada = argumentos.entrada.expanduser().resolve()
    saida = (
        argumentos.saida.expanduser().resolve()
        if argumentos.saida
        else entrada.with_suffix(".svg")
    )

    try:
        vetorizar(
            entrada=entrada,
            saida=saida,
            recortar=not argumentos.sem_recorte,
            alpha_minimo=max(0, min(255, argumentos.alpha_minimo)),
        )
    except Exception as erro:
        print(f"Erro: {erro}", file=sys.stderr)
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
