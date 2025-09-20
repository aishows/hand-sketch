const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = {
  entry: './src/index.js',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'bundle.[contenthash].js',
    clean: true,
    assetModuleFilename: 'assets/[name][ext]',
    publicPath: '/hand-sketch/'
  },
  devtool: 'source-map', // Add source maps for debugging
  module: {
    rules: [
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader']
      },
      {
        test: /\.(png|svg|jpg|jpeg|gif)$/i,
        type: 'asset/resource'
      }
    ]
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: './src/index.html',
      filename: 'index.html'
    }),
    new CopyWebpackPlugin({
      patterns: [
        { from: 'src/assets', to: 'assets', noErrorOnMissing: true },
        // Copy MediaPipe assets
        { from: 'node_modules/@mediapipe/hands/*.wasm', to: 'assets/[name][ext]' },
        { from: 'node_modules/@mediapipe/hands/*.data', to: 'assets/[name][ext]' },
        { from: 'node_modules/@mediapipe/hands/*.js', to: 'assets/[name][ext]' },
        { from: 'node_modules/@mediapipe/hands/*.tflite', to: 'assets/[name][ext]' },
        { from: 'node_modules/@mediapipe/hands/*.binarypb', to: 'assets/[name][ext]' }
      ]
    })
  ],
  devServer: {
    static: {
      directory: path.join(__dirname, 'dist')
    },
    compress: true,
    port: 8080
  }
};